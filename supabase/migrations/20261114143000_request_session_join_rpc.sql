-- Allow each join request to be traced to the invite token used.
alter table public.join_requests
  add column if not exists invite_id uuid
  references public.session_invites(id) on delete set null;

create index if not exists join_requests_invite_idx
  on public.join_requests(invite_id);

-- Prevent simultaneous pending requests from reserving the same nickname.
create unique index if not exists join_requests_pending_nickname_ci
  on public.join_requests(session_id, lower(nickname))
  where status = 'pending';

create or replace function public.request_session_join(
  p_token text,
  p_nickname text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_token_hash text;
  v_invite_id uuid;
  v_invite public.session_invites%rowtype;
  v_session public.game_sessions%rowtype;
  v_request_id uuid;
  v_existing_nickname text;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_token is null or p_token !~ '^[0-9a-fA-F]{64}$' then
    raise exception 'Invite invalid or expired' using errcode = '22023';
  end if;

  if p_nickname is null or char_length(btrim(p_nickname)) not between 2 and 20 then
    raise exception 'Nickname must contain 2 to 20 characters' using errcode = '22023';
  end if;

  v_token_hash := encode(
    extensions.digest(convert_to(lower(p_token), 'UTF8'), 'sha256'),
    'hex'
  );

  -- Discover the session, then lock rows in the same order as invite creation:
  -- session first, invite second. This avoids lock-order deadlocks.
  select i.id, i.session_id
    into v_invite_id, v_session.id
    from public.session_invites i
   where i.token_hash = v_token_hash;

  if not found then
    raise exception 'Invite invalid or expired' using errcode = '22023';
  end if;

  select *
    into v_session
    from public.game_sessions s
   where s.id = v_session.id
   for update;

  if not found then
    raise exception 'Invite invalid or expired' using errcode = '22023';
  end if;

  select *
    into v_invite
    from public.session_invites i
   where i.id = v_invite_id
     and i.session_id = v_session.id
     and i.token_hash = v_token_hash
   for update;

  if not found
     or v_invite.revoked_at is not null
     or v_invite.expires_at <= now()
     or v_invite.use_count >= v_invite.max_uses
     or v_session.status not in ('created', 'active') then
    raise exception 'Invite invalid, expired, revoked, or full' using errcode = '22023';
  end if;

  if exists (
    select 1
      from public.session_members m
     where m.session_id = v_session.id
       and m.user_id = v_user_id
  ) then
    raise exception 'You already have a membership record for this session'
      using errcode = '23505';
  end if;

  select jr.id
    into v_request_id
    from public.join_requests jr
   where jr.session_id = v_session.id
     and jr.user_id = v_user_id
     and jr.status = 'pending';

  if found then
    return jsonb_build_object(
      'request_id', v_request_id,
      'session_id', v_session.id,
      'status', 'pending',
      'already_requested', true
    );
  end if;

  if exists (
    select 1
      from public.session_members m
     where m.session_id = v_session.id
       and m.status = 'active'
       and lower(m.nickname) = lower(btrim(p_nickname))
  ) or exists (
    select 1
      from public.join_requests jr
     where jr.session_id = v_session.id
       and jr.status = 'pending'
       and lower(jr.nickname) = lower(btrim(p_nickname))
  ) then
    raise exception 'Nickname is already in use for this session'
      using errcode = '23505';
  end if;

  insert into public.join_requests
    (session_id, user_id, nickname, status, invite_id)
  values
    (v_session.id, v_user_id, btrim(p_nickname), 'pending', v_invite.id)
  on conflict do nothing
  returning id into v_request_id;

  if v_request_id is null then
    -- A concurrent request may have claimed the nickname or created this user's
    -- pending request. Return the existing request only for the same user.
    select jr.id
      into v_request_id
      from public.join_requests jr
     where jr.session_id = v_session.id
       and jr.user_id = v_user_id
       and jr.status = 'pending';

    if v_request_id is not null then
      return jsonb_build_object(
        'request_id', v_request_id,
        'session_id', v_session.id,
        'status', 'pending',
        'already_requested', true
      );
    end if;

    raise exception 'Nickname is already in use for this session'
      using errcode = '23505';
  end if;

  return jsonb_build_object(
    'request_id', v_request_id,
    'session_id', v_session.id,
    'nickname', btrim(p_nickname),
    'status', 'pending',
    'already_requested', false
  );
end;
$$;

revoke all on function public.request_session_join(text, text) from public;
revoke all on function public.request_session_join(text, text) from anon;
grant execute on function public.request_session_join(text, text) to authenticated;
