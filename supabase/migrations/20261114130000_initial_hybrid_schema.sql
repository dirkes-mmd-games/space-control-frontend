-- Space Control Hybrid Demonstrator: initial Supabase schema
-- Date: 2026-11-14
-- This migration creates the data model and read policies.
-- Critical writes are intentionally exposed only through trusted server-side functions.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  game_id text not null,
  display_name text not null,
  status text not null default 'created'
    check (status in ('created', 'active', 'finished', 'cancelled')),
  created_by uuid not null references auth.users(id),
  max_members integer not null default 3 check (max_members between 1 and 100),
  created_at timestamptz not null default now()
);

create table if not exists public.session_members (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  nickname text not null check (char_length(btrim(nickname)) between 2 and 20),
  status text not null default 'active'
    check (status in ('active', 'left', 'removed')),
  joined_at timestamptz not null default now(),
  unique (session_id, user_id),
  unique (id, session_id)
);

create unique index if not exists session_members_nickname_ci
  on public.session_members (session_id, lower(nickname));

create table if not exists public.session_permissions (
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  permission text not null check (permission in ('admin')),
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users(id),
  primary key (session_id, user_id, permission)
);

create table if not exists public.session_invites (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  max_uses integer not null default 3 check (max_uses > 0),
  use_count integer not null default 0 check (use_count >= 0 and use_count <= max_uses),
  revoked_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.join_requests (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  nickname text not null check (char_length(btrim(nickname)) between 2 and 20),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'expired')),
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users(id),
  unique (id, session_id)
);

create unique index if not exists one_pending_join_request_per_user
  on public.join_requests (session_id, user_id)
  where status = 'pending';

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  member_id uuid not null unique,
  balance bigint not null default 1000 check (balance >= 0),
  currency text not null default 'CREDITS',
  created_at timestamptz not null default now(),
  foreign key (member_id, session_id)
    references public.session_members(id, session_id) on delete cascade,
  unique (id, session_id)
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  idempotency_key text not null,
  transaction_type text not null
    check (transaction_type in ('opening_balance', 'transfer', 'adjustment')),
  description text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (session_id, idempotency_key),
  unique (id, session_id)
);

create table if not exists public.transaction_entries (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null,
  session_id uuid not null,
  account_id uuid not null,
  amount bigint not null check (amount <> 0),
  created_at timestamptz not null default now(),
  foreign key (transaction_id, session_id)
    references public.transactions(id, session_id) on delete cascade,
  foreign key (account_id, session_id)
    references public.accounts(id, session_id)
);

create table if not exists public.card_definitions (
  id uuid primary key default gen_random_uuid(),
  game_id text not null,
  game_version text not null,
  card_code text not null,
  card_text text not null,
  unique (game_id, game_version, card_code)
);

create table if not exists public.session_cards (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  definition_id uuid not null references public.card_definitions(id),
  created_at timestamptz not null default now(),
  unique (session_id, definition_id),
  unique (id, session_id)
);

create table if not exists public.card_assignments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  session_card_id uuid not null,
  member_id uuid not null,
  assigned_at timestamptz not null default now(),
  foreign key (session_card_id, session_id)
    references public.session_cards(id, session_id) on delete cascade,
  foreign key (member_id, session_id)
    references public.session_members(id, session_id) on delete cascade,
  unique (session_card_id),
  unique (session_id, member_id)
);

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  admin_user_id uuid not null references auth.users(id),
  action text not null,
  target_type text,
  target_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists session_members_user_idx on public.session_members(user_id);
create index if not exists join_requests_admin_idx on public.join_requests(session_id, status, requested_at);
create index if not exists transaction_entries_account_idx on public.transaction_entries(account_id);
create index if not exists card_assignments_member_idx on public.card_assignments(session_id, member_id);

-- Security-definer helpers avoid recursive policy evaluation on membership/permission tables.
create or replace function public.is_session_member(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.session_members m
    where m.session_id = p_session_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  );
$$;

create or replace function public.is_session_admin(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.session_permissions p
    where p.session_id = p_session_id
      and p.user_id = (select auth.uid())
      and p.permission = 'admin'
  );
$$;

create or replace function public.owns_account(p_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.accounts a
    join public.session_members m on m.id = a.member_id
    where a.id = p_account_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  );
$$;

revoke all on function public.is_session_member(uuid) from public;
revoke all on function public.is_session_admin(uuid) from public;
revoke all on function public.owns_account(uuid) from public;
grant execute on function public.is_session_member(uuid) to authenticated;
grant execute on function public.is_session_admin(uuid) to authenticated;
grant execute on function public.owns_account(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.game_sessions enable row level security;
alter table public.session_members enable row level security;
alter table public.session_permissions enable row level security;
alter table public.session_invites enable row level security;
alter table public.join_requests enable row level security;
alter table public.accounts enable row level security;
alter table public.transactions enable row level security;
alter table public.transaction_entries enable row level security;
alter table public.card_definitions enable row level security;
alter table public.session_cards enable row level security;
alter table public.card_assignments enable row level security;
alter table public.admin_audit_log enable row level security;

create policy profiles_read_self on public.profiles
  for select to authenticated using (user_id = (select auth.uid()));

create policy profiles_insert_self on public.profiles
  for insert to authenticated with check (user_id = (select auth.uid()));

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy sessions_read_member_or_admin on public.game_sessions
  for select to authenticated
  using (public.is_session_member(id) or public.is_session_admin(id));

create policy members_read_same_session on public.session_members
  for select to authenticated
  using (public.is_session_member(session_id) or public.is_session_admin(session_id));

create policy permissions_read_own_or_admin on public.session_permissions
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_session_admin(session_id));

create policy invites_admin_read on public.session_invites
  for select to authenticated
  using (public.is_session_admin(session_id));

create policy join_requests_read_own_or_admin on public.join_requests
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_session_admin(session_id));

create policy accounts_read_owner_or_admin on public.accounts
  for select to authenticated
  using (public.owns_account(id) or public.is_session_admin(session_id));

create policy transactions_read_member_entries_or_admin on public.transactions
  for select to authenticated
  using (
    public.is_session_admin(session_id)
    or exists (
      select 1
      from public.transaction_entries e
      where e.transaction_id = transactions.id
        and public.owns_account(e.account_id)
    )
  );

create policy entries_read_owner_or_admin on public.transaction_entries
  for select to authenticated
  using (
    public.owns_account(account_id)
    or exists (
      select 1 from public.accounts a
      where a.id = transaction_entries.account_id
        and public.is_session_admin(a.session_id)
    )
  );

-- Card definitions and the unassigned pool are never directly readable by participants.
create policy card_definitions_admin_read on public.card_definitions
  for select to authenticated
  using (
    exists (
      select 1 from public.session_cards sc
      where sc.definition_id = card_definitions.id
        and public.is_session_admin(sc.session_id)
    )
  );

create policy session_cards_admin_read on public.session_cards
  for select to authenticated
  using (public.is_session_admin(session_id));

create policy card_assignments_owner_or_admin_read on public.card_assignments
  for select to authenticated
  using (
    exists (
      select 1 from public.session_members m
      where m.id = card_assignments.member_id
        and m.user_id = (select auth.uid())
        and m.status = 'active'
    )
    or public.is_session_admin(session_id)
  );

create policy admin_audit_admin_read on public.admin_audit_log
  for select to authenticated
  using (public.is_session_admin(session_id));

-- No INSERT/UPDATE/DELETE policies are intentionally defined for game state.
-- Trusted Edge Functions / database RPCs perform all critical writes.
