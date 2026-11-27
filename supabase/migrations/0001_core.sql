-- =====================================================================
-- Scouting & Recruitment Platform — core schema
--
-- One table of documents (collection + id + JSON data), the same model the
-- app used as a prototype. Every read and write goes through row level
-- security that applies the platform's roles and permissions in the
-- database itself, so the interface is never the only protection.
--
-- The Owner is identified by a confirmed email stored in public.app_config
-- (set once, outside this file).
-- =====================================================================

create schema if not exists app;

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

-- Singleton configuration. No policies: clients can never read or change it.
create table public.app_config (
  id          boolean primary key default true check (id),
  owner_email text not null
);

-- The permission catalogue and each role's defaults (mirrors the app).
create table public.permissions (
  perm     text primary key,
  requires text[] not null default '{}'
);
create table public.role_grants (
  role text not null,
  perm text not null references public.permissions (perm) on delete cascade,
  primary key (role, perm)
);

-- All platform data.
create table public.docs (
  collection text        not null,
  id         text        not null,
  data       jsonb       not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (collection, id)
);

-- Names and emails of people with an account, for showing authors and members.
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null default '',
  name       text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.app_config  enable row level security;
alter table public.permissions enable row level security;
alter table public.role_grants enable row level security;
alter table public.docs        enable row level security;
alter table public.profiles    enable row level security;

-- ---------------------------------------------------------------------
-- Who is asking
-- ---------------------------------------------------------------------

-- True for the Owner: a signed-in account whose confirmed email is the configured one.
create or replace function app.is_owner()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from auth.users u
    join public.app_config c on true
    where u.id = auth.uid()
      and u.email_confirmed_at is not null
      and lower(u.email) = lower(c.owner_email)
  );
$$;

-- The caller's membership record, or null.
create or replace function app.member_data()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select d.data from public.docs d
  where d.collection = 'members' and d.id = auth.uid()::text;
$$;

-- Effective permissions: everything for the Owner; for an active member the
-- role's defaults, then their overrides, then prerequisites (an action is
-- dropped when something it needs is missing) — the same rule as the app.
create or replace function app.perms()
returns text[]
language plpgsql stable security definer set search_path = ''
as $$
declare
  m       jsonb;
  s       text[];
  ov      record;
  k       text;
  changed boolean := true;
begin
  if auth.uid() is null then
    return '{}';
  end if;
  if app.is_owner() then
    return array(select perm from public.permissions);
  end if;
  m := app.member_data();
  if m is null or coalesce(m ->> 'status', 'active') = 'suspended' then
    return '{}';
  end if;
  s := array(select g.perm from public.role_grants g where g.role = m ->> 'role');
  for ov in select key, value from jsonb_each(coalesce(m -> 'overrides', '{}'::jsonb)) loop
    continue when not exists (select 1 from public.permissions p where p.perm = ov.key);
    s := array_remove(s, ov.key);
    if ov.value = 'true'::jsonb then
      s := array_append(s, ov.key);
    end if;
  end loop;
  while changed loop
    changed := false;
    foreach k in array s loop
      if exists (select 1 from public.permissions p where p.perm = k and not (p.requires <@ s)) then
        s := array_remove(s, k);
        changed := true;
      end if;
    end loop;
  end loop;
  return s;
end;
$$;

-- ---------------------------------------------------------------------
-- What each collection allows (pure rules; permissions are passed in once per query)
-- ---------------------------------------------------------------------

create or replace function app.can_read(c text, i text, d jsonb, p text[], owner boolean)
returns boolean
language sql stable set search_path = ''
as $$
  select case
    when owner then true
    when auth.uid() is null then false
    when c = 'org'                 then true
    when c = 'members'             then i = auth.uid()::text or cardinality(p) > 0
    when c = 'joinRequests'        then i = auth.uid()::text
    when c = 'presence'            then i = auth.uid()::text
    when c = 'settings'            then cardinality(p) > 0
    when c = 'players'             then p && array['players.view', 'squad.view', 'shortlists.view', 'shadow.view']
    when c like 'squads/%/members' then p && array['players.view', 'squad.view']
    when c = 'needs'               then p && array['shortlists.view', 'squad.view']
    when c = 'shadowTeams'         then 'shadow.view' = any (p)
    when c = 'reports'             then 'reports.viewTeam' = any (p)
                                     or ('reports.viewOwn' = any (p) and coalesce(d ->> 'authorId', '') = auth.uid()::text)
    when c = 'observationRequests' then 'assignments.viewAll' = any (p)
                                     or ('assignments.viewOwn' = any (p) and coalesce(d ->> 'assigneeId', '') = auth.uid()::text)
    when c = 'notes'               then 'notes.view' = any (p)
    else false  -- finance, invites, recruitment and anything new: Owner only
  end;
$$;

-- op: 'insert' | 'update' | 'delete'. d is the new data (insert, update) or the old data (update check, delete).
create or replace function app.can_write(c text, i text, d jsonb, p text[], owner boolean, op text)
returns boolean
language sql stable set search_path = ''
as $$
  select case
    when owner then true
    when auth.uid() is null then false
    when c in ('joinRequests', 'presence') then i = auth.uid()::text
    when cardinality(p) = 0 then false
    when c = 'players' then
      case when op = 'delete' then 'players.delete' = any (p)
           else p && array['players.create', 'players.edit', 'players.import', 'players.delete', 'reports.create',
                           'shortlists.create', 'shortlists.edit', 'squad.edit', 'shadow.addPlayers'] end
    when c like 'squads/%/members' then p && array['squad.edit', 'players.delete']
    when c = 'needs'       then p && array['shortlists.create', 'shortlists.edit', 'shortlists.delete', 'players.delete']
    when c = 'shadowTeams' then p && array['shadow.create', 'shadow.edit', 'shadow.delete', 'shadow.addPlayers', 'players.delete']
    when c = 'settings'    then 'criteria.manage' = any (p)
    when c = 'reports' then
      case when coalesce(d ->> 'authorId', '') = auth.uid()::text then
             (op = 'insert' and 'reports.create' = any (p))
          or (op = 'update' and p && array['reports.editOwn', 'reports.create'])
          or (op = 'delete' and p && array['reports.deleteOwn', 'players.delete'])
           else
             (op = 'update' and 'reports.editOthers' = any (p))
          or (op = 'delete' and p && array['reports.deleteOthers', 'players.delete'])
      end
    when c = 'observationRequests' then
         p && array['assignments.manage', 'assignments.create']
      or (op = 'delete' and 'players.delete' = any (p))
      or ('assignments.viewOwn' = any (p) and coalesce(d ->> 'assigneeId', '') = auth.uid()::text)
    when c = 'notes' then
      case when coalesce(d ->> 'authorId', '') = auth.uid()::text then
             (op = 'insert' and 'notes.create' = any (p))
          or (op <> 'insert' and p && array['notes.editOwn', 'notes.manage'])
           else
             (op <> 'insert' and 'notes.manage' = any (p))
          or (op = 'delete' and 'players.delete' = any (p))
      end
    else false  -- members, invites, org, finance, recruitment: Owner only
  end;
$$;

-- ---------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------

create policy docs_select on public.docs
  for select to authenticated
  using (app.can_read(collection, id, data, (select app.perms()), (select app.is_owner())));

create policy docs_insert on public.docs
  for insert to authenticated
  with check (app.can_write(collection, id, data, (select app.perms()), (select app.is_owner()), 'insert'));

create policy docs_update on public.docs
  for update to authenticated
  using      (app.can_write(collection, id, data, (select app.perms()), (select app.is_owner()), 'update'))
  with check (app.can_write(collection, id, data, (select app.perms()), (select app.is_owner()), 'update'));

create policy docs_delete on public.docs
  for delete to authenticated
  using (app.can_write(collection, id, data, (select app.perms()), (select app.is_owner()), 'delete'));

create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or (select app.is_owner()) or cardinality((select app.perms())) > 0);

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---------------------------------------------------------------------
-- Writes used by the app (run with the caller's rights, so the policies apply)
-- ---------------------------------------------------------------------

-- Deep merge of JSON objects; arrays and other values are replaced.
create or replace function app.jsonb_merge(a jsonb, b jsonb)
returns jsonb
language sql immutable set search_path = ''
as $$
  select case
    when jsonb_typeof(a) = 'object' and jsonb_typeof(b) = 'object' then
      coalesce((
        select jsonb_object_agg(k,
          case when a ? k and b ? k then app.jsonb_merge(a -> k, b -> k)
               when b ? k then b -> k
               else a -> k end)
        from (select jsonb_object_keys(a) as k union select jsonb_object_keys(b)) keys
      ), '{}'::jsonb)
    else b
  end;
$$;

-- Replace a document (create it when it does not exist).
create or replace function public.doc_set(c text, i text, d jsonb)
returns void
language plpgsql security invoker set search_path = ''
as $$
begin
  update public.docs set data = d, updated_at = now() where collection = c and id = i;
  if not found then
    insert into public.docs (collection, id, data) values (c, i, d);
  end if;
end;
$$;

-- Merge fields into an existing document.
create or replace function public.doc_patch(c text, i text, patch jsonb)
returns void
language plpgsql security invoker set search_path = ''
as $$
begin
  update public.docs set data = app.jsonb_merge(data, patch), updated_at = now()
  where collection = c and id = i;
  if not found then
    raise exception 'Document % / % not found or not permitted', c, i using errcode = 'P0002';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Accounts
-- ---------------------------------------------------------------------

-- Keep profiles in step with accounts (name comes from sign-up).
create or replace function app.sync_profile()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, name, updated_at)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data ->> 'name', ''), now())
  on conflict (id) do update
    set email = excluded.email,
        name = case when excluded.name <> '' then excluded.name else public.profiles.name end,
        updated_at = now();
  return new;
end;
$$;

create trigger on_auth_user_changed
  after insert or update of email, raw_user_meta_data on auth.users
  for each row execute function app.sync_profile();

-- Is the caller the Owner?
create or replace function public.am_i_owner()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select app.is_owner();
$$;

-- An invited person who signs in with the invited, confirmed email becomes a
-- member with the role and permissions of the invitation. Nothing happens
-- for anyone else. Returns what it found.
create or replace function public.accept_invite()
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  uid   uuid := auth.uid();
  em    text;
  inv   record;
  stamp text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  if uid is null then return 'anonymous'; end if;
  if app.is_owner() then return 'owner'; end if;
  if exists (select 1 from public.docs where collection = 'members' and id = uid::text) then return 'member'; end if;
  select lower(u.email) into em from auth.users u where u.id = uid and u.email_confirmed_at is not null;
  if em is null then return 'unconfirmed'; end if;
  select d.id, d.data into inv
  from public.docs d
  where d.collection = 'invites'
    and lower(d.data ->> 'email') = em
    and coalesce(d.data ->> 'status', 'pending') = 'pending'
  order by d.created_at
  limit 1;
  if not found then return 'none'; end if;

  insert into public.docs (collection, id, data) values ('members', uid::text, jsonb_build_object(
    'userId', uid::text,
    'role', coalesce(inv.data ->> 'role', 'scout'),
    'overrides', coalesce(inv.data -> 'overrides', '{}'::jsonb),
    'status', 'active',
    'email', em,
    'inviteId', inv.id,
    'joinedAt', stamp,
    'updatedAt', stamp));
  update public.docs
    set data = data || jsonb_build_object('status', 'accepted', 'userId', uid::text, 'updatedAt', stamp),
        updated_at = now()
  where collection = 'invites' and id = inv.id;
  delete from public.docs where collection = 'joinRequests' and id = uid::text;
  return 'joined';
end;
$$;

-- ---------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------

grant usage on schema app to authenticated;
revoke all on all functions in schema app from public, anon;
grant execute on all functions in schema app to authenticated;

revoke all on function public.doc_set(text, text, jsonb)   from public, anon;
revoke all on function public.doc_patch(text, text, jsonb) from public, anon;
revoke all on function public.am_i_owner()                 from public, anon;
revoke all on function public.accept_invite()              from public, anon;
grant execute on function public.doc_set(text, text, jsonb)   to authenticated;
grant execute on function public.doc_patch(text, text, jsonb) to authenticated;
grant execute on function public.am_i_owner()                 to authenticated;
grant execute on function public.accept_invite()              to authenticated;

revoke all on public.app_config, public.permissions, public.role_grants from anon, authenticated;
revoke all on public.docs, public.profiles from anon;

-- ---------------------------------------------------------------------
-- Live updates
-- ---------------------------------------------------------------------

alter publication supabase_realtime add table public.docs;
