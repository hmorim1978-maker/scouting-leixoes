-- =====================================================================
-- Scouts see only what they create.
--  * New permissions: players.viewOwn and notes.viewOwn ("own" vs "all").
--  * Own players = players the person added (createdBy) plus the players of
--    their own tasks and reports. Own notes = notes they wrote.
--  * Members and profiles: each person sees their own; the Owner's profile is
--    visible to everyone (author of tasks); everything else needs users.view.
-- Permission catalogue and role defaults are regenerated from app.js.
-- =====================================================================

delete from public.role_grants;
delete from public.permissions;

insert into public.permissions (perm, requires) values
  ('players.viewOwn', array[]::text[]),
  ('players.view', array['players.viewOwn']::text[]),
  ('players.create', array['players.viewOwn']::text[]),
  ('players.edit', array['players.viewOwn']::text[]),
  ('players.delete', array['players.view']::text[]),
  ('players.import', array['players.create']::text[]),
  ('notes.viewOwn', array['players.viewOwn']::text[]),
  ('notes.view', array['notes.viewOwn']::text[]),
  ('notes.create', array['notes.viewOwn']::text[]),
  ('notes.editOwn', array['notes.viewOwn']::text[]),
  ('notes.manage', array['notes.view']::text[]),
  ('reports.viewOwn', array[]::text[]),
  ('reports.viewTeam', array['reports.viewOwn']::text[]),
  ('reports.create', array['reports.viewOwn', 'players.viewOwn']::text[]),
  ('reports.editOwn', array['reports.viewOwn']::text[]),
  ('reports.editOthers', array['reports.viewTeam']::text[]),
  ('reports.deleteOwn', array['reports.viewOwn']::text[]),
  ('reports.deleteOthers', array['reports.viewTeam']::text[]),
  ('assignments.viewOwn', array[]::text[]),
  ('assignments.viewAll', array['assignments.viewOwn']::text[]),
  ('assignments.create', array['assignments.viewAll']::text[]),
  ('assignments.manage', array['assignments.viewAll']::text[]),
  ('criteria.view', array[]::text[]),
  ('criteria.manage', array['criteria.view']::text[]),
  ('shortlists.view', array[]::text[]),
  ('shortlists.create', array['shortlists.view']::text[]),
  ('shortlists.edit', array['shortlists.view']::text[]),
  ('shortlists.delete', array['shortlists.view']::text[]),
  ('shadow.view', array[]::text[]),
  ('shadow.create', array['shadow.view']::text[]),
  ('shadow.edit', array['shadow.view']::text[]),
  ('shadow.delete', array['shadow.view']::text[]),
  ('shadow.addPlayers', array['shadow.view']::text[]),
  ('squad.view', array[]::text[]),
  ('squad.edit', array['squad.view']::text[]),
  ('recruitment.view', array[]::text[]),
  ('recruitment.create', array['recruitment.view']::text[]),
  ('recruitment.edit', array['recruitment.view']::text[]),
  ('recruitment.manage', array['recruitment.view']::text[]),
  ('financial.viewMarket', array[]::text[]),
  ('financial.viewAsking', array[]::text[]),
  ('financial.viewSalary', array[]::text[]),
  ('financial.viewTransfer', array[]::text[]),
  ('financial.viewNotes', array[]::text[]),
  ('financial.edit', array['financial.viewMarket', 'financial.viewAsking', 'financial.viewSalary', 'financial.viewTransfer', 'financial.viewNotes']::text[]),
  ('users.view', array[]::text[]),
  ('users.invite', array['users.view']::text[]),
  ('users.editRole', array['users.view']::text[]),
  ('users.editPermissions', array['users.view']::text[]),
  ('users.remove', array['users.view']::text[]),
  ('org.settings', array[]::text[]),
  ('data.export', array[]::text[]);

insert into public.role_grants (role, perm) values
  ('sporting_director', 'players.viewOwn'),
  ('sporting_director', 'players.view'),
  ('sporting_director', 'players.create'),
  ('sporting_director', 'players.edit'),
  ('sporting_director', 'players.delete'),
  ('sporting_director', 'players.import'),
  ('sporting_director', 'notes.viewOwn'),
  ('sporting_director', 'notes.view'),
  ('sporting_director', 'notes.create'),
  ('sporting_director', 'notes.editOwn'),
  ('sporting_director', 'notes.manage'),
  ('sporting_director', 'reports.viewOwn'),
  ('sporting_director', 'reports.viewTeam'),
  ('sporting_director', 'reports.create'),
  ('sporting_director', 'reports.editOwn'),
  ('sporting_director', 'reports.editOthers'),
  ('sporting_director', 'reports.deleteOwn'),
  ('sporting_director', 'reports.deleteOthers'),
  ('sporting_director', 'assignments.viewOwn'),
  ('sporting_director', 'assignments.viewAll'),
  ('sporting_director', 'assignments.create'),
  ('sporting_director', 'assignments.manage'),
  ('sporting_director', 'criteria.view'),
  ('sporting_director', 'criteria.manage'),
  ('sporting_director', 'shortlists.view'),
  ('sporting_director', 'shortlists.create'),
  ('sporting_director', 'shortlists.edit'),
  ('sporting_director', 'shortlists.delete'),
  ('sporting_director', 'shadow.view'),
  ('sporting_director', 'shadow.create'),
  ('sporting_director', 'shadow.edit'),
  ('sporting_director', 'shadow.delete'),
  ('sporting_director', 'shadow.addPlayers'),
  ('sporting_director', 'squad.view'),
  ('sporting_director', 'squad.edit'),
  ('sporting_director', 'recruitment.view'),
  ('sporting_director', 'recruitment.create'),
  ('sporting_director', 'recruitment.edit'),
  ('sporting_director', 'recruitment.manage'),
  ('sporting_director', 'financial.viewMarket'),
  ('sporting_director', 'financial.viewAsking'),
  ('sporting_director', 'financial.viewSalary'),
  ('sporting_director', 'financial.viewTransfer'),
  ('sporting_director', 'financial.viewNotes'),
  ('sporting_director', 'financial.edit'),
  ('sporting_director', 'users.view'),
  ('sporting_director', 'data.export'),
  ('chief_scout', 'players.viewOwn'),
  ('chief_scout', 'players.view'),
  ('chief_scout', 'players.create'),
  ('chief_scout', 'players.edit'),
  ('chief_scout', 'players.import'),
  ('chief_scout', 'notes.viewOwn'),
  ('chief_scout', 'notes.view'),
  ('chief_scout', 'notes.create'),
  ('chief_scout', 'notes.editOwn'),
  ('chief_scout', 'reports.viewOwn'),
  ('chief_scout', 'reports.viewTeam'),
  ('chief_scout', 'reports.create'),
  ('chief_scout', 'reports.editOwn'),
  ('chief_scout', 'reports.deleteOwn'),
  ('chief_scout', 'assignments.viewOwn'),
  ('chief_scout', 'assignments.viewAll'),
  ('chief_scout', 'assignments.create'),
  ('chief_scout', 'assignments.manage'),
  ('chief_scout', 'criteria.view'),
  ('chief_scout', 'criteria.manage'),
  ('chief_scout', 'shortlists.view'),
  ('chief_scout', 'shortlists.create'),
  ('chief_scout', 'shortlists.edit'),
  ('chief_scout', 'shortlists.delete'),
  ('chief_scout', 'shadow.view'),
  ('chief_scout', 'shadow.edit'),
  ('chief_scout', 'shadow.addPlayers'),
  ('chief_scout', 'users.view'),
  ('scout', 'players.viewOwn'),
  ('scout', 'players.create'),
  ('scout', 'players.edit'),
  ('scout', 'notes.viewOwn'),
  ('scout', 'notes.create'),
  ('scout', 'notes.editOwn'),
  ('scout', 'reports.viewOwn'),
  ('scout', 'reports.create'),
  ('scout', 'reports.editOwn'),
  ('scout', 'reports.deleteOwn'),
  ('scout', 'assignments.viewOwn'),
  ('scout', 'criteria.view'),
  ('analyst', 'players.viewOwn'),
  ('analyst', 'players.view');

-- Players reachable through the caller's own tasks and reports.
create or replace function app.my_scope_players()
returns text[]
language sql stable security definer set search_path = ''
as $$
  select coalesce(array_agg(distinct s.pid), '{}')
  from (
    select d.data ->> 'playerId' as pid from public.docs d
    where d.collection = 'observationRequests' and d.data ->> 'assigneeId' = auth.uid()::text
    union
    select d.data ->> 'playerId' from public.docs d
    where d.collection = 'reports' and d.data ->> 'authorId' = auth.uid()::text
  ) s
  where s.pid is not null and s.pid <> '';
$$;

-- The Owner's account id (confirmed email in app_config).
create or replace function app.owner_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select u.id from auth.users u join public.app_config c on lower(u.email) = lower(c.owner_email)
  where u.email_confirmed_at is not null
  limit 1;
$$;

drop policy docs_select on public.docs;
drop function app.can_read(text, text, jsonb, text[], boolean);

create or replace function app.can_read(c text, i text, d jsonb, p text[], owner boolean, scope text[])
returns boolean
language sql stable set search_path = ''
as $$
  select case
    when owner then true
    when auth.uid() is null then false
    when c = 'org'                 then true
    when c = 'members'             then i = auth.uid()::text or 'users.view' = any (p)
    when c = 'joinRequests'        then i = auth.uid()::text
    when c = 'presence'            then i = auth.uid()::text
    when c = 'settings'            then cardinality(p) > 0
    when c = 'players'             then p && array['players.view', 'squad.view', 'shortlists.view', 'shadow.view']
                                     or ('players.viewOwn' = any (p)
                                         and (coalesce(d ->> 'createdBy', '') = auth.uid()::text or i = any (scope)))
    when c like 'squads/%/members' then p && array['players.view', 'squad.view']
    when c = 'needs'               then p && array['shortlists.view', 'squad.view']
    when c = 'shadowTeams'         then 'shadow.view' = any (p)
    when c = 'reports'             then 'reports.viewTeam' = any (p)
                                     or ('reports.viewOwn' = any (p) and coalesce(d ->> 'authorId', '') = auth.uid()::text)
    when c = 'observationRequests' then 'assignments.viewAll' = any (p)
                                     or ('assignments.viewOwn' = any (p) and coalesce(d ->> 'assigneeId', '') = auth.uid()::text)
    when c = 'notes'               then 'notes.view' = any (p)
                                     or ('notes.viewOwn' = any (p) and coalesce(d ->> 'authorId', '') = auth.uid()::text)
    else false
  end;
$$;

create policy docs_select on public.docs
  for select to authenticated
  using (app.can_read(collection, id, data, (select app.perms()), (select app.is_owner()), (select app.my_scope_players())));

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
           when p && array['players.view', 'squad.edit', 'shortlists.create', 'shortlists.edit', 'shadow.addPlayers'] then
             p && array['players.create', 'players.edit', 'players.import', 'players.delete', 'reports.create',
                        'shortlists.create', 'shortlists.edit', 'squad.edit', 'shadow.addPlayers']
           -- "own" scope: only players they added, and they stay theirs
           else 'players.viewOwn' = any (p)
                and p && array['players.create', 'players.edit', 'players.import']
                and coalesce(d ->> 'createdBy', '') = auth.uid()::text
      end
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
    else false
  end;
$$;

drop policy profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or id = (select app.owner_id()) or (select app.is_owner())
         or (select app.perms()) @> array['users.view']);

revoke all on all functions in schema app from public, anon;
grant execute on all functions in schema app to authenticated;
