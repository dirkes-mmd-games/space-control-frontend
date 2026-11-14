-- Atomic create_session operation for the Space Control hybrid demonstrator.
-- The caller must be authenticated; auth.uid() becomes creator, first member and session admin.

create or replace function public.create_session(
  p_game_id text,
  p_display_name text,
  p_nickname text,
  p_max_members integer default 3,
  p_initial_balance bigint default 1000,
  p_currency text default 'CREDITS'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id uuid;
  v_member_id uuid;
  v_account_id uuid;
  v_transaction_id uuid;
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
  if p_nickname is null or length(btrim(p_nickname)) not between 2 and 20 then
    raise exception 'nickname must contain 2 to 20 characters' using errcode = '22023';
  end if;
  if p_max_members < 1 or p_max_members > 100 then
    raise exception 'max_members must be between 1 and 100' using errcode = '22023';
  end if;
  if p_initial_balance < 0 or p_initial_balance > 1000000000 then
    raise exception 'initial balance out of range' using errcode = '22023';
  end if;
  if p_currency is null or p_currency !~ '^[A-Z0-9_]{2,12}$' then
    raise exception 'Invalid currency code' using errcode = '22023';
  end if;

  insert into public.game_sessions (game_id, display_name, created_by, max_members)
  values (btrim(p_game_id), btrim(p_display_name), v_user_id, p_max_members)
  returning id into v_session_id;

  insert into public.session_members (session_id, user_id, nickname)
  values (v_session_id, v_user_id, btrim(p_nickname))
  returning id into v_member_id;

  insert into public.session_permissions (session_id, user_id, permission, granted_by)
  values (v_session_id, v_user_id, 'admin', v_user_id);

  insert into public.accounts (session_id, member_id, balance, currency)
  values (v_session_id, v_member_id, p_initial_balance, p_currency)
  returning id into v_account_id;

  if p_initial_balance > 0 then
    insert into public.transactions
      (session_id, idempotency_key, transaction_type, description, created_by)
    values
      (v_session_id, 'opening-balance:' || v_member_id::text, 'opening_balance',
       'Initial account balance', v_user_id)
    returning id into v_transaction_id;

    insert into public.transaction_entries (transaction_id, session_id, account_id, amount)
    values (v_transaction_id, v_session_id, v_account_id, p_initial_balance);
  end if;

  return jsonb_build_object(
    'session_id', v_session_id,
    'member_id', v_member_id,
    'account_id', v_account_id,
    'created_by', v_user_id,
    'status', 'created',
    'max_members', p_max_members,
    'initial_balance', p_initial_balance,
    'currency', p_currency
  );
end;
$$;

revoke all on function public.create_session(text, text, text, integer, bigint, text) from public;
revoke all on function public.create_session(text, text, text, integer, bigint, text) from anon;
grant execute on function public.create_session(text, text, text, integer, bigint, text) to authenticated;
