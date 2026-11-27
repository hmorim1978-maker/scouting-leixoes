-- Table privileges for signed-in people; row level security decides which rows.
grant select, insert, update, delete on public.docs to authenticated;
grant select, update (name) on public.profiles to authenticated;
