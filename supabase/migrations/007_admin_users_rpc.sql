-- ============================================================================
-- Nandha Music — 007_admin_users_rpc.sql (Area C-ADMIN, 28 Nov 2026)
--
-- Real data source for the Users admin page (audit C4/H2): until now
-- UsersAdmin read only localStorage, and its role/block controls were
-- fake. These SECURITY DEFINER functions give the admin UI a real,
-- RLS-proof route to auth.users + user_roles + profiles:
--
--   * public.admin_list_users() — all users (id, email, created_at,
--     role, blocked, display_name). Admin-only; non-admins get an
--     error, never an empty list (an empty list would look like "no
--     users"). Used by UsersAdmin and by Dashboard "Total users"
--     (count = rows returned).
--   * public.admin_set_user(p_user_id, p_role, p_blocked) — set a
--     user's role and/or blocked flag. Admin-only (enforced inside the
--     function via public.is_admin(), so the client cannot bypass it).
--     Role changes write user_roles AND keep profiles.role in sync;
--     blocked writes profiles.blocked.
--   * public.is_blocked() — true when the CALLER's own profiles row
--     has blocked = true. Used by src/lib/auth.jsx to refuse sign-in
--     and session restore for blocked users. Any authenticated user
--     may call it (it only ever answers about the caller).
--
-- Blocked state lives in a profiles.blocked column (added below if
-- missing) — no extra table. A user with no profiles row is not
-- blocked.
--
-- GRANTs: execute is revoked from PUBLIC and granted to authenticated
-- only. The anon key can never call these functions; admin-ness is
-- still enforced inside each function, so a leaked/excess grant
-- cannot escalate a listener.
--
-- Depends on: 001_schema.sql (public.is_admin(), public.profiles,
-- public.user_roles). Does NOT depend on 005 (the is_admin() EXECUTE
-- grant for the client) — these functions call is_admin() server-side
-- as the function owner.
--
-- Apply in the Supabase SQL Editor (parent dashboard step). Idempotent
-- — re-running is safe (create or replace + if not exists).
-- CANNOT be verified from code alone: after applying, sign in as the
-- admin and open /admin/users — the real user list must appear.
-- 007a (28 Nov 2026 ~04:30 IST): explicit ::uuid/::text/::timestamptz/
-- ::boolean casts on every RETURN QUERY column — live /admin/users
-- failed with 42804 "structure of query does not match function result
-- type" on the uncast version; the casts make the function robust to
-- live column types (e.g. auth.users.email is varchar(255), not text).
-- ============================================================================

-- Blocked flag on the profile row. No profiles row = not blocked.
alter table public.profiles
  add column if not exists blocked boolean not null default false;

-- ---------------------------------------------------------------------------
-- is_blocked(): may the caller use the app?
-- ---------------------------------------------------------------------------
create or replace function public.is_blocked()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and blocked = true
  );
$$;

-- ---------------------------------------------------------------------------
-- admin_list_users(): full user list for the admin UI.
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_users()
returns table (
  id uuid,
  email text,
  created_at timestamptz,
  role text,
  blocked boolean,
  display_name text
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  return query
    select
      u.id::uuid,
      u.email::text,
      u.created_at::timestamptz,
      coalesce(
        (select 'admin' from public.user_roles r
          where r.user_id = u.id and r.role = 'admin' limit 1),
        (select 'artist' from public.user_roles r
          where r.user_id = u.id and r.role = 'artist' limit 1),
        p.role,
        'listener'
      )::text as role,
      coalesce(p.blocked, false)::boolean as blocked,
      p.display_name::text
    from auth.users u
    left join public.profiles p on p.id = u.id
    order by u.created_at desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_set_user(): set role and/or blocked for one user. Either
-- argument may be null to leave that field unchanged. Returns the
-- updated row in the same shape as admin_list_users().
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_user(
  p_user_id uuid,
  p_role text default null,
  p_blocked boolean default null
)
returns table (
  id uuid,
  email text,
  created_at timestamptz,
  role text,
  blocked boolean,
  display_name text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  _email text;
  _created_at timestamptz;
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  if p_role is not null and p_role not in ('listener', 'artist', 'admin') then
    raise exception 'invalid_role: %', p_role;
  end if;

  select u.email, u.created_at into _email, _created_at
    from auth.users u where u.id = p_user_id;
  if not found then
    raise exception 'user_not_found: %', p_user_id;
  end if;

  -- Role: user_roles is the authority RLS checks; profiles.role is
  -- kept in sync as the display role.
  if p_role is not null then
    delete from public.user_roles where user_id = p_user_id;
    if p_role <> 'listener' then
      insert into public.user_roles (user_id, role) values (p_user_id, p_role);
    end if;
  end if;

  insert into public.profiles (id, email, role, blocked)
  values (p_user_id, _email, coalesce(p_role, 'listener'), coalesce(p_blocked, false))
  on conflict (id) do update set
    email = excluded.email,
    role = coalesce(p_role, public.profiles.role),
    blocked = coalesce(p_blocked, public.profiles.blocked),
    updated_at = now();

  return query
    select
      u.id::uuid,
      u.email::text,
      u.created_at::timestamptz,
      coalesce(
        (select 'admin' from public.user_roles r
          where r.user_id = u.id and r.role = 'admin' limit 1),
        (select 'artist' from public.user_roles r
          where r.user_id = u.id and r.role = 'artist' limit 1),
        p.role,
        'listener'
      )::text as role,
      coalesce(p.blocked, false)::boolean as blocked,
      p.display_name::text
    from auth.users u
    left join public.profiles p on p.id = u.id
    where u.id = p_user_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: authenticated only — never anon, never public.
-- ---------------------------------------------------------------------------
revoke execute on function public.is_blocked() from public;
revoke execute on function public.admin_list_users() from public;
revoke execute on function public.admin_set_user(uuid, text, boolean) from public;

grant execute on function public.is_blocked() to authenticated;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_set_user(uuid, text, boolean) to authenticated;
