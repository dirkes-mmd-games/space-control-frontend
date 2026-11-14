create or replace function public.start_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_session public.game_sessions%rowtype;
  v_active_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select * into v_session
    from public.game_sessions s
   where s.id = p_session_id
   for update;

  if not found then
    raise exception 'Session not found' using errcode = 'P0002';
  end if;

  if not public.is_session_admin(p_session_id) then
    raise exception 'Only a session admin can start this session' using errcode = '42501';
  end if;

  if v_session.status = 'active' then
    return jsonb_build_object('session_id', p_session_id, 'status', 'active', 'already_started', true);
  end if;

  if v_session.status <> 'created' then
    raise exception 'Session cannot be started in its current state' using errcode = '22023';
  end if;

  select count(*) into v_active_count
    from public.session_members m
   where m.session_id = p_session_id and m.status = 'active';

  if v_active_count < 2 then
    raise exception 'At least two active players are required to start' using errcode = '22023';
  end if;

  update public.game_sessions set status = 'active' where id = p_session_id;

  insert into public.admin_audit_log
    (session_id, admin_user_id, action, target_type, target_id)
  values
    (p_session_id, auth.uid(), 'session_started', 'game_session', p_session_id);

  return jsonb_build_object(
    'session_id', p_session_id,
    'status', 'active',
    'active_players', v_active_count,
    'target_players', v_session.max_members
  );
end;
$function$;

grant execute on function public.start_session(uuid) to authenticated;
