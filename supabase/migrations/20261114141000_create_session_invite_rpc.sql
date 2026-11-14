-- Create a fresh, time-limited invite for a session.
-- The raw token is returned once; only its SHA-256 hash is stored.

create or replace function public.create_session_invite(
  p_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_session public.game_sessions%rowtype;
  v_invite_id uuid;
  v_token text;
  v_expires_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select *
    into v_session
    from public.game_sessions
   where id = p_session_id
   for update;

  if not found then
    raise exception 'Session not found' using errcode = 'P0002';
  end if;

  if not public.is_session_admin(p_session_id) then
    raise exception 'Only a session admin can create an invite' using errcode = '42501';
  end if;

  if v_session.status not in ('created', 'active') then
    raise exception 'Invites cannot be created for a finished or cancelled session'
      using errcode = '22023';
  end if;

  -- A newly issued QR code supersedes all previous active invite links.
  update public.session_invites
     set revoked_at = now()
   where session_id = p_session_id
     and revoked_at is null
     and expires_at > now();

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_expires_at := now() + interval '24 hours';

  insert into public.session_invites
    (session_id, token_hash, expires_at, max_uses, created_by)
  values
    (
      p_session_id,
      encode(extensions.digest(convert_to(v_token, 'UTF8'), 'sha256'), 'hex'),
      v_expires_at,
      v_session.max_members,
      v_user_id
    )
  returning id into v_invite_id;

  insert into public.admin_audit_log
    (session_id, admin_user_id, action, target_type, target_id)
  values
    (p_session_id, v_user_id, 'invite_created', 'session_invite', v_invite_id);

  return jsonb_build_object(
    'invite_id', v_invite_id,
    'session_id', p_session_id,
    'token', v_token,
    'expires_at', v_expires_at,
    'max_uses', v_session.max_members,
    'supersedes_previous_invites', true
  );
end;
$$;

revoke all on function public.create_session_invite(uuid) from public;
revoke all on function public.create_session_invite(uuid) from anon;
grant execute on function public.create_session_invite(uuid) to authenticated;
