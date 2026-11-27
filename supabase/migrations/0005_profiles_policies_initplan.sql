-- Evaluate auth.uid() once per query in the profiles policies; index the permission foreign key.
drop policy profiles_select on public.profiles;
drop policy profiles_update_own on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select app.is_owner()) or cardinality((select app.perms())) > 0);
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
create index if not exists role_grants_perm_idx on public.role_grants (perm);
