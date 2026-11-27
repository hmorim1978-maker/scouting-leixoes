-- Keep the privileged code out of the exposed API schema: the public functions
-- run with the caller's rights and call the privileged ones in schema app.
alter function public.accept_invite() rename to accept_invite_impl;
alter function public.accept_invite_impl() set schema app;

create or replace function public.accept_invite()
returns text
language sql security invoker set search_path = ''
as $$ select app.accept_invite_impl(); $$;

create or replace function public.am_i_owner()
returns boolean
language sql stable security invoker set search_path = ''
as $$ select app.is_owner(); $$;

revoke all on function app.accept_invite_impl() from public, anon;
grant execute on function app.accept_invite_impl() to authenticated;
revoke all on function public.accept_invite() from public, anon;
revoke all on function public.am_i_owner() from public, anon;
grant execute on function public.accept_invite() to authenticated;
grant execute on function public.am_i_owner() to authenticated;
