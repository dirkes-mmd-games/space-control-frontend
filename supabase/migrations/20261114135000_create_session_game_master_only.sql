-- Change create_session: the creator is game admin only, not a player.
-- All players, including the game master, must join through the shared invite flow.

drop function if exists public.create_session(text, text, text, integer, bigint, text);

create function public.create_session(
  p_game_id text,
  p_display_name text,
  p_max_members integer default 3
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_game_id is null or length(btrim(p_game_id)) = 0 or length(p_game_id) > 80 then
    raise exception 'Invalid game_id' using errcode = '22023';
  end if;
  if p_display_name is null or length(btrim(p_display_name)) not between 2 and 60 then
    raise exception 'display_name must contain 2 to 60 characters' using errcode = '22023';
  end if;
  if p_max_members is null or p_max_members < 2 or p_max_members > 3 then
    raise exception 'The demonstrator supports 2 to 3 players' using errcode = '22023';
  end if;

  insert into public.game_sessions (game_id, display_name, created_by, max_members)
  values (btrim(p_game_id), btrim(p_display_name), v_user_id, p_max_members)
  returning id into v_session_id;

  -- Admin is a session-scoped management permission, not a player membership.
  insert into public.session_permissions (session_id, user_id, permission, granted_by)
  values (v_session_id, v_user_id, 'admin', v_user_id);

  return jsonb_build_object(
    'session_id', v_session_id,
    'created_by', v_user_id,
    'status', 'created',
    'max_members', p_max_members,
    'creator_is_player', false,
    'creator_is_admin', true
  );
end;
$$;

revoke all on function public.create_session(text, text, integer) from public;
revoke all on function public.create_session(text, text, integer) from anon;
grant execute on function public.create_session(text, text, integer) to authenticated;
