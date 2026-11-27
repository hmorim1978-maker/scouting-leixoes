-- Row level security checks. Runs everything inside one block and ends with an
-- exception, so every fixture is rolled back; the exception message holds the results.
do $$
declare
  o uuid := gen_random_uuid();   -- Owner
  s uuid := gen_random_uuid();   -- Scout
  c uuid := gen_random_uuid();   -- Chief Scout
  x uuid := gen_random_uuid();   -- signed in, not a member
  i uuid := gen_random_uuid();   -- invited, not joined yet
  out text := '';
  n int;
  ok boolean;
  r text;
begin
  update public.app_config set owner_email = 'owner@test.local';
  if not found then insert into public.app_config (owner_email) values ('owner@test.local'); end if;

  insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data, aud, role) values
    (o, 'owner@test.local', now(), '{"name":"Owner T"}', 'authenticated', 'authenticated'),
    (s, 'scout@test.local', now(), '{"name":"Scout T"}', 'authenticated', 'authenticated'),
    (c, 'chief@test.local', now(), '{"name":"Chief T"}', 'authenticated', 'authenticated'),
    (x, 'out@test.local',   now(), '{"name":"Out T"}',   'authenticated', 'authenticated'),
    (i, 'Invited@Test.local', now(), '{"name":"Inv T"}', 'authenticated', 'authenticated');

  insert into public.docs (collection, id, data) values
    ('org', 'main', '{"name":"Club"}'),
    ('members', s::text, jsonb_build_object('userId', s, 'role', 'scout', 'status', 'active', 'overrides', '{}'::jsonb)),
    ('members', c::text, jsonb_build_object('userId', c, 'role', 'chief_scout', 'status', 'active', 'overrides', '{}'::jsonb)),
    ('invites', 'inv-1', '{"email":"invited@test.local","role":"scout","status":"pending","overrides":{"squad.view":true}}'),
    ('players', 'p-1', '{"name":"Player One"}'),
    ('squads/2026-27/members', 'p-1', '{"playerId":"p-1"}'),
    ('shadowTeams', 'st-1', '{"name":"Plan A","entries":[]}'),
    ('needs', 'n-1', '{"position":"CB","candidates":[]}'),
    ('finance', 'p-1', '{"salary":"1000"}'),
    ('reports', 'r-s', jsonb_build_object('playerId', 'p-1', 'authorId', s)),
    ('reports', 'r-c', jsonb_build_object('playerId', 'p-1', 'authorId', c)),
    ('reports', 'r-legacy', '{"playerId":"p-1","authorId":""}'),
    ('notes', 'nt-s', jsonb_build_object('playerId', 'p-1', 'authorId', s, 'text', 'hello')),
    ('observationRequests', 'q-s', jsonb_build_object('playerId', 'p-1', 'assigneeId', s)),
    ('observationRequests', 'q-c', jsonb_build_object('playerId', 'p-1', 'assigneeId', c)),
    ('settings', 'evaluation', '{"attributes":{}}');

  -- profiles came from the trigger
  select count(*) into n from public.profiles where id in (o, s, c, x, i);
  out := out || format('profiles created by trigger: %s (expect 5)', n) || E'\n';

  -- ---------- helper: count rows of a collection as a user ----------
  -- (inline: switch role + claims, count, reset)

  -- OUTSIDER
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', x::text, true);
  execute 'set local role authenticated';
  out := out || format('outsider: org=%s members=%s players=%s reports=%s finance=%s invites=%s profiles=%s',
    (select count(*) from public.docs where collection = 'org'),
    (select count(*) from public.docs where collection = 'members'),
    (select count(*) from public.docs where collection = 'players'),
    (select count(*) from public.docs where collection = 'reports'),
    (select count(*) from public.docs where collection = 'finance'),
    (select count(*) from public.docs where collection = 'invites'),
    (select count(*) from public.profiles)) || '  (expect 1 0 0 0 0 0 1)' || E'\n';
  begin
    perform public.doc_set('joinRequests', x::text, '{"email":"out@test.local"}');
    out := out || 'outsider: own join request OK' || E'\n';
  exception when others then out := out || 'outsider: own join request FAILED ' || sqlerrm || E'\n'; end;
  begin
    perform public.doc_set('joinRequests', s::text, '{"email":"fake"}');
    out := out || 'outsider: other''s join request ALLOWED (bad)' || E'\n';
  exception when others then out := out || 'outsider: other''s join request refused' || E'\n'; end;
  begin
    perform public.doc_set('players', 'p-x', '{"name":"Hack"}');
    out := out || 'outsider: write player ALLOWED (bad)' || E'\n';
  exception when others then out := out || 'outsider: write player refused' || E'\n'; end;
  execute 'reset role';

  -- SCOUT
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', s::text, true);
  execute 'set local role authenticated';
  out := out || format('scout: members=%s players=%s squad=%s shadow=%s needs=%s reports=%s notes=%s requests=%s settings=%s finance=%s invites=%s profiles=%s',
    (select count(*) from public.docs where collection = 'members'),
    (select count(*) from public.docs where collection = 'players'),
    (select count(*) from public.docs where collection like 'squads/%/members'),
    (select count(*) from public.docs where collection = 'shadowTeams'),
    (select count(*) from public.docs where collection = 'needs'),
    (select count(*) from public.docs where collection = 'reports'),
    (select count(*) from public.docs where collection = 'notes'),
    (select count(*) from public.docs where collection = 'observationRequests'),
    (select count(*) from public.docs where collection = 'settings'),
    (select count(*) from public.docs where collection = 'finance'),
    (select count(*) from public.docs where collection = 'invites'),
    (select count(*) from public.profiles)) || '  (expect 2 1 1 1 1 1 1 1 1 0 0 5)' || E'\n';
  begin perform public.doc_set('reports', 'r-new', jsonb_build_object('authorId', s, 'playerId', 'p-1')); out := out || 'scout: create own report OK' || E'\n';
  exception when others then out := out || 'scout: create own report FAILED ' || sqlerrm || E'\n'; end;
  begin perform public.doc_set('reports', 'r-forged', jsonb_build_object('authorId', c, 'playerId', 'p-1')); out := out || 'scout: forged author ALLOWED (bad)' || E'\n';
  exception when others then out := out || 'scout: forged author refused' || E'\n'; end;
  begin perform public.doc_patch('reports', 'r-c', '{"summary":"x"}'); out := out || 'scout: edit chief''s report ALLOWED (bad)' || E'\n';
  exception when others then out := out || 'scout: edit chief''s report refused' || E'\n'; end;
  begin perform public.doc_patch('reports', 'r-s', '{"authorId":"' || c || '"}'); out := out || 'scout: hand own report to chief ALLOWED (bad)' || E'\n';
  exception when others then out := out || 'scout: hand own report to chief refused' || E'\n'; end;
  begin perform public.doc_patch('players', 'p-1', '{"club":"New"}'); out := out || 'scout: edit player OK' || E'\n';
  exception when others then out := out || 'scout: edit player FAILED ' || sqlerrm || E'\n'; end;
  delete from public.docs where collection = 'players' and id = 'p-1';
  get diagnostics n = row_count;
  out := out || format('scout: delete player rows=%s (expect 0)', n) || E'\n';
  begin perform public.doc_set('finance', 'p-1', '{"salary":"0"}'); out := out || 'scout: write finance ALLOWED (bad)' || E'\n';
  exception when others then out := out || 'scout: write finance refused' || E'\n'; end;
  begin perform public.doc_patch('members', s::text, '{"role":"sporting_director"}'); out := out || 'scout: raise own role ALLOWED (bad)' || E'\n';
  exception when others then out := out || 'scout: raise own role refused' || E'\n'; end;
  begin perform public.doc_set('invites', 'inv-x', '{"email":"a@b.c","role":"sporting_director"}'); out := out || 'scout: create invite ALLOWED (bad)' || E'\n';
  exception when others then out := out || 'scout: create invite refused' || E'\n'; end;
  begin perform public.doc_patch('settings', 'evaluation', '{"attributes":{"x":[]}}'); out := out || 'scout: change criteria ALLOWED (bad)' || E'\n';
  exception when others then out := out || 'scout: change criteria refused' || E'\n'; end;
  begin perform public.doc_patch('observationRequests', 'q-s', '{"status":"done"}'); out := out || 'scout: finish own assignment OK' || E'\n';
  exception when others then out := out || 'scout: finish own assignment FAILED ' || sqlerrm || E'\n'; end;
  begin perform public.doc_set('notes', 'nt-forged', jsonb_build_object('authorId', c, 'text', 'x')); out := out || 'scout: forged note ALLOWED (bad)' || E'\n';
  exception when others then out := out || 'scout: forged note refused' || E'\n'; end;
  select public.am_i_owner() into ok;
  out := out || format('scout: am_i_owner=%s (expect false)', ok) || E'\n';
  execute 'reset role';

  -- CHIEF SCOUT
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', c::text, true);
  execute 'set local role authenticated';
  out := out || format('chief: reports=%s requests=%s finance=%s invites=%s',
    (select count(*) from public.docs where collection = 'reports'),
    (select count(*) from public.docs where collection = 'observationRequests'),
    (select count(*) from public.docs where collection = 'finance'),
    (select count(*) from public.docs where collection = 'invites')) || '  (expect 4 2 0 0)' || E'\n';
  begin perform public.doc_patch('settings', 'evaluation', '{"attributes":{"x":["a"]}}'); out := out || 'chief: change criteria OK' || E'\n';
  exception when others then out := out || 'chief: change criteria FAILED ' || sqlerrm || E'\n'; end;
  execute 'reset role';

  -- OWNER
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', o::text, true);
  execute 'set local role authenticated';
  select public.am_i_owner() into ok;
  out := out || format('owner: am_i_owner=%s total docs visible=%s finance=%s invites=%s',
    ok, (select count(*) from public.docs), (select count(*) from public.docs where collection = 'finance'),
    (select count(*) from public.docs where collection = 'invites')) || E'\n';
  -- the owner narrows the scout: suspend
  perform public.doc_patch('members', s::text, '{"status":"suspended"}');
  -- the owner widens the chief through an override (manage notes)
  perform public.doc_patch('members', c::text, '{"overrides":{"notes.manage":true}}');
  execute 'reset role';

  -- SCOUT again, suspended
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', s::text, true);
  execute 'set local role authenticated';
  out := out || format('suspended scout: players=%s reports=%s members=%s  (expect 0 0 1)',
    (select count(*) from public.docs where collection = 'players'),
    (select count(*) from public.docs where collection = 'reports'),
    (select count(*) from public.docs where collection = 'members')) || E'\n';
  execute 'reset role';

  -- CHIEF with override: may now edit the scout's note
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', c::text, true);
  execute 'set local role authenticated';
  begin perform public.doc_patch('notes', 'nt-s', '{"text":"edited"}'); out := out || 'chief+override: edit scout''s note OK' || E'\n';
  exception when others then out := out || 'chief+override: edit scout''s note FAILED ' || sqlerrm || E'\n'; end;
  execute 'reset role';

  -- INVITED person accepts (email matched without regard to case)
  perform set_config('request.jwt.claims', json_build_object('sub', i, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', i::text, true);
  execute 'set local role authenticated';
  out := out || format('invited before: players=%s', (select count(*) from public.docs where collection = 'players')) || E'\n';
  select public.accept_invite() into r;
  out := out || format('invited: accept_invite=%s; players now=%s squad now=%s', r,
    (select count(*) from public.docs where collection = 'players'),
    (select count(*) from public.docs where collection like 'squads/%/members')) || '  (expect joined 1 1)' || E'\n';
  select public.accept_invite() into r;
  out := out || format('invited: second call=%s (expect member)', r) || E'\n';
  execute 'reset role';

  -- OUTSIDER cannot accept anything
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', x::text, true);
  execute 'set local role authenticated';
  select public.accept_invite() into r;
  out := out || format('outsider: accept_invite=%s (expect none)', r) || E'\n';
  execute 'reset role';

  -- deep merge
  out := out || format('merge: %s', app.jsonb_merge('{"a":{"b":1,"c":2},"l":[1,2],"k":1}', '{"a":{"c":3},"l":[9]}')) || E'\n';

  raise exception E'RLS TEST RESULTS (rolled back)\n%', out;
end;
$$;
