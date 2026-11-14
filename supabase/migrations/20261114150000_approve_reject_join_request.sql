-- Atomically approve or reject a pending session join request.
-- Approval creates the member, account and opening-balance ledger entry as one transaction.

create or replace function public.approve_join_request(
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id uuid;
  v_session public.game_sessions%rowtype;
  v_request public.join_requests%rowtype;
  v_invite public.session_invites%rowtype;
  v_member_id uuid;
  v_account_id uuid;
  v_transaction_id uuid;
  v_active_count integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select jr.session_id
    into v_session_id
    from public.join_requests jr
   where jr.id = p_request_id;

  if not found then
    raise exception 'Join request not found' using errcode = 'P0002';
  end if;

  -- Consistent lock order: session, request, invite.
  select *
    into v_session
    from public.game_sessions s
   where s.id = v_session_id
   for update;

  if not found then
    raise exception 'Session not found' using errcode = 'P0002';
  end if;

  if not public.is_session_admin(v_session_id) then
    raise exception 'Only a session admin can approve join requests' using errcode = '42501';
  end if;

  select *
    into v_request
    from public.join_requests jr
   where jr.id = p_request_id
     and jr.session_id = v_session_id
   for update;

  if not found then
    raise exception 'Join request not found' using errcode = 'P0002';
  end if;

  -- Idempotent retry: return the already-created membership and account.
  if v_request.status = 'approved' then
    select m.id, a.id
      into v_member_id, v_account_id
      from public.session_members m
      join public.accounts a on a.member_id = m.id
     where m.session_id = v_session_id
       and m.user_id = v_request.user_id;

    return jsonb_build_object(
      'request_id', p_request_id,
      'session_id', v_session_id,
      'status', 'approved',
      'member_id', v_member_id,
      'account_id', v_account_id,
      'already_approved', true
    );
  end if;

  if v_request.status <> 'pending' then
    raise exception 'Join request is not pending' using errcode = '22023';
  end if;

  if v_session.status not in ('created', 'active') then
    raise exception 'Session is not accepting players' using errcode = '22023';
  end if;

  if v_request.invite_id is null then
    raise exception 'Join request has no valid invite reference' using errcode = '22023';
  end if;

  select *
    into v_invite
    from public.session_invites i
   where i.id = v_request.invite_id
     and i.session_id = v_session_id
   for update;

  if not found
     or v_invite.revoked_at is not null
     or v_invite.expires_at <= now()
     or v_invite.use_count >= v_invite.max_uses then
    raise exception 'The invite is no longer valid; ask the player to scan the current QR code'
      using errcode = '22023';
  end if;

  if exists (
    select 1
      from public.session_members m
     where m.session_id = v_session_id
       and m.user_id = v_request.user_id
  ) then
    raise exception 'This user already has a membership record'
      using errcode = '23505';
  end if;

  if exists (
    select 1
      from public.session_members m
     where m.session_id = v_session_id
       and m.status = 'active'
       and lower(m.nickname) = lower(v_request.nickname)
  ) then
    raise exception 'Nickname is already in use for this session'
      using errcode = '23505';
  end if;

  select count(*)
    into v_active_count
    from public.session_members m
   where m.session_id = v_session_id
     and m.status = 'active';

  if v_active_count >= v_session.max_members then
    raise exception 'Session is already full' using errcode = '22023';
  end if;

  insert into public.session_members (session_id, user_id, nickname, status)
  values (v_session_id, v_request.user_id, v_request.nickname, 'active')
  returning id into v_member_id;

  insert into public.accounts (session_id, member_id, balance, currency)
  values (v_session_id, v_member_id, 1000, 'CREDITS')
  returning id into v_account_id;

  insert into public.transactions
    (session_id, idempotency_key, transaction_type, description, created_by)
  values
    (
      v_session_id,
      'join-opening-balance:' || p_request_id::text,
      'opening_balance',
      'Startguthaben für ' || v_request.nickname,
      v_user_id
    )
  returning id into v_transaction_id;

  insert into public.transaction_entries
    (transaction_id, session_id, account_id, amount)
  values
    (v_transaction_id, v_session_id, v_account_id, 1000);

  update public.session_invites
     set use_count = use_count + 1
   where id = v_invite.id;

  update public.join_requests
     set status = 'approved',
         decided_at = now(),
         decided_by = v_user_id
   where id = p_request_id;

  insert into public.admin_audit_log
    (session_id, admin_user_id, action, target_type, target_id)
  values
    (v_session_id, v_user_id, 'join_request_approved', 'join_request', p_request_id);

  return jsonb_build_object(
    'request_id', p_request_id,
    'session_id', v_session_id,
    'status', 'approved',
    'member_id', v_member_id,
    'account_id', v_account_id,
    'initial_balance', 1000,
    'currency', 'CREDITS',
    'already_approved', false
  );
end;
$$;

create or replace function public.reject_join_request(
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id uuid;
  v_request public.join_requests%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select jr.session_id
    into v_session_id
    from public.join_requests jr
   where jr.id = p_request_id;

  if not found then
    raise exception 'Join request not found' using errcode = 'P0002';
  end if;

  -- Match the approval lock order for predictable concurrent decisions.
  perform 1
    from public.game_sessions s
   where s.id = v_session_id
   for update;

  if not found then
    raise exception 'Session not found' using errcode = 'P0002';
  end if;

  if not public.is_session_admin(v_session_id) then
    raise exception 'Only a session admin can reject join requests' using errcode = '42501';
  end if;

  select *
    into v_request
    from public.join_requests jr
   where jr.id = p_request_id
     and jr.session_id = v_session_id
   for update;

  if not found then
    raise exception 'Join request not found' using errcode = 'P0002';
  end if;

  if v_request.status = 'rejected' then
    return jsonb_build_object(
      'request_id', p_request_id,
      'session_id', v_session_id,
      'status', 'rejected',
      'already_rejected', true
    );
  end if;

  if v_request.status <> 'pending' then
    raise exception 'Only pending join requests can be rejected' using errcode = '22023';
  end if;

  update public.join_requests
     set status = 'rejected',
         decided_at = now(),
         decided_by = v_user_id
   where id = p_request_id;

  insert into public.admin_audit_log
    (session_id, admin_user_id, action, target_type, target_id)
  values
    (v_session_id, v_user_id, 'join_request_rejected', 'join_request', p_request_id);

  return jsonb_build_object(
    'request_id', p_request_id,
    'session_id', v_session_id,
    'status', 'rejected',
    'already_rejected', false
  );
end;
$$;

revoke all on function public.approve_join_request(uuid) from public;
revoke all on function public.approve_join_request(uuid) from anon;
grant execute on function public.approve_join_request(uuid) to authenticated;

revoke all on function public.reject_join_request(uuid) from public;
revoke all on function public.reject_join_request(uuid) from anon;
grant execute on function public.reject_join_request(uuid) to authenticated;
