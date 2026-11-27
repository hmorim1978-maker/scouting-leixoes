-- Scouts see only what they create (migration 0006). Everything runs inside one
-- block that ends with an exception, so every fixture is rolled back; the
-- exception message holds the results. Fixture rows use the "tst-" prefix and
-- every count is limited to them, so the real data never affects the numbers.
do $$
declare
  o  uuid := gen_random_uuid();   -- Owner
  a  uuid := gen_random_uuid();   -- Scout A
  b  uuid := gen_random_uuid();   -- Scout B
  c  uuid := gen_random_uuid();   -- Chief Scout
  out text := '';
  n int;
begin
  update public.app_config set owner_email = 'owner@test.local';
  if not found then insert into public.app_config (owner_email) values ('owner@test.local'); end if;

  insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data, aud, role) values
    (o, 'owner@test.local',  now(), '{"name":"Owner T"}',   'authenticated', 'authenticated'),
    (a, 'scouta@test.local', now(), '{"name":"Scout A"}',   'authenticated', 'authenticated'),
    (b, 'scoutb@test.local', now(), '{"name":"Scout B"}',   'authenticated', 'authenticated'),
    (c, 'chief@test.local',  now(), '{"name":"Chief T"}',   'authenticated', 'authenticated');

  insert into public.docs (collection, id, data) values
    ('members', a::text, jsonb_build_object('userId', a, 'role', 'scout', 'status', 'active', 'overrides', '{}'::jsonb)),
    ('members', b::text, jsonb_build_object('userId', b, 'role', 'scout', 'status', 'active', 'overrides', '{}'::jsonb)),
    ('members', c::text, jsonb_build_object('userId', c, 'role', 'chief_scout', 'status', 'active', 'overrides', '{}'::jsonb)),
    ('players', 'tst-own-a',  jsonb_build_object('name', 'Added by A', 'createdBy', a)),
    ('players', 'tst-own-b',  jsonb_build_object('name', 'Added by B', 'createdBy', b)),
    ('players', 'tst-owner',  jsonb_build_object('name', 'Added by the Owner', 'createdBy', o)),
    ('players', 'tst-legacy', '{"name":"Imported before createdBy"}'),
    ('players', 'tst-task-a', jsonb_build_object('name', 'In a task for A', 'createdBy', o)),
    ('players', 'tst-rep-a',  jsonb_build_object('name', 'Reported by A', 'createdBy', o)),
    ('observationRequests', 'tst-q-a', jsonb_build_object('playerId', 'tst-task-a', 'assigneeId', a, 'createdBy', o)),
    ('observationRequests', 'tst-q-b', jsonb_build_object('playerId', 'tst-owner', 'assigneeId', b, 'createdBy', o)),
    ('reports', 'tst-r-a', jsonb_build_object('playerId', 'tst-rep-a', 'authorId', a)),
    ('reports', 'tst-r-b', jsonb_build_object('playerId', 'tst-own-b', 'authorId', b)),
    ('notes', 'tst-n-a', jsonb_build_object('playerId', 'tst-task-a', 'authorId', a, 'text', 'mine')),
    ('notes', 'tst-n-b', jsonb_build_object('playerId', 'tst-task-a', 'authorId', b, 'text', 'not mine')),
    ('notes', 'tst-n-o', jsonb_build_object('playerId', 'tst-own-a', 'authorId', o, 'text', 'owner''s'));

  -- SCOUT A
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', a::text, true);
  execute 'set local role authenticated';
  out := out || format('scout A sees players: %s  (expect tst-own-a,tst-rep-a,tst-task-a)',
    (select string_agg(id, ',' order by id) from public.docs where collection = 'players' and id like 'tst-%')) || E'\n';
  out := out || format('scout A: all players visible=%s notes=%s reports=%s tasks=%s members=%s profiles=%s  (expect 3 1 1 1 1 2)',
    (select count(*) from public.docs where collection = 'players'),
    (select count(*) from public.docs where collection = 'notes' and id like 'tst-%'),
    (select count(*) from public.docs where collection = 'reports' and id like 'tst-%'),
    (select count(*) from public.docs where collection = 'observationRequests' and id like 'tst-%'),
    (select count(*) from public.docs where collection = 'members'),
    (select count(*) from public.profiles where id in (o, a, b, c))) || E'\n';
  begin perform public.doc_patch('players', 'tst-own-a', '{"club":"FC A"}'); out := out || 'scout A: edit own player OK' || E'\n';
  exception when others then out := out || 'scout A: edit own player FAILED ' || sqlerrm || E'\n'; end;
  begin perform public.doc_patch('players', 'tst-task-a', '{"club":"X"}'); out := out || 'scout A: edit task player ALLOWED (bad)' || E'\n';
  exception when others then out := out || 'scout A: edit task player refused' || E'\n'; end;
  begin perform public.doc_patch('players', 'tst-own-b', '{"club":"X"}'); out := out || 'scout A: edit B''s player ALLOWED (bad)' || E'\n';
  exception when others then out := out || 'scout A: edit B''s player refused' || E'\n'; end;
  begin perform public.doc_set('players', 'tst-own-b', jsonb_build_object('name', 'Taken', 'createdBy', a)); out := out || 'scout A: overwrite B''s player ALLOWED (bad)' || E'\n';
  exception when others then out := out || 'scout A: overwrite B''s player refused' || E'\n'; end;
  begin perform public.doc_patch('players', 'tst-own-a', jsonb_build_object('createdBy', b)); out := out || 'scout A: hand own player to B ALLOWED (bad)' || E'\n';
  exception when others then out := out || 'scout A: hand own player to B refused' || E'\n'; end;
  begin perform public.doc_set('players', 'tst-new-a', jsonb_build_object('name', 'New', 'createdBy', a)); out := out || 'scout A: add player OK' || E'\n';
  exception when others then out := out || 'scout A: add player FAILED ' || sqlerrm || E'\n'; end;
  begin perform public.doc_set('players', 'tst-new-x', '{"name":"No author"}'); out := out || 'scout A: add player without author ALLOWED (bad)' || E'\n';
  exception when others then out := out || 'scout A: add player without author refused' || E'\n'; end;
  begin perform public.doc_set('players', 'tst-new-y', jsonb_build_object('name', 'Forged', 'createdBy', b)); out := out || 'scout A: add player as B ALLOWED (bad)' || E'\n';
  exception when others then out := out || 'scout A: add player as B refused' || E'\n'; end;
  delete from public.docs where collection = 'players' and id = 'tst-own-a';
  get diagnostics n = row_count;
  out := out || format('scout A: delete own player rows=%s (expect 0)', n) || E'\n';
  begin perform public.doc_set('notes', 'tst-n-a2', jsonb_build_object('playerId', 'tst-task-a', 'authorId', a, 'text', 'x')); out := out || 'scout A: write note OK' || E'\n';
  exception when others then out := out || 'scout A: write note FAILED ' || sqlerrm || E'\n'; end;
  begin perform public.doc_patch('notes', 'tst-n-b', '{"text":"edited"}'); out := out || 'scout A: edit B''s note ALLOWED (bad)' || E'\n';
  exception when others then out := out || 'scout A: edit B''s note refused' || E'\n'; end;
  begin perform public.doc_set('reports', 'tst-r-a2', jsonb_build_object('playerId', 'tst-task-a', 'authorId', a)); out := out || 'scout A: report on task player OK' || E'\n';
  exception when others then out := out || 'scout A: report on task player FAILED ' || sqlerrm || E'\n'; end;
  out := out || format('scout A: new player visible=%s (expect 1)',
    (select count(*) from public.docs where collection = 'players' and id = 'tst-new-a')) || E'\n';
  execute 'reset role';

  -- SCOUT B
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', b::text, true);
  execute 'set local role authenticated';
  out := out || format('scout B sees players: %s notes=%s  (expect tst-own-b,tst-owner 1)',
    (select string_agg(id, ',' order by id) from public.docs where collection = 'players' and id like 'tst-%'),
    (select count(*) from public.docs where collection = 'notes' and id like 'tst-%')) || E'\n';
  execute 'reset role';

  -- CHIEF SCOUT (sees everything scouting-related)
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', c::text, true);
  execute 'set local role authenticated';
  out := out || format('chief: test players=%s notes=%s members=%s profiles=%s  (expect 7 4 3 4)',
    (select count(*) from public.docs where collection = 'players' and id like 'tst-%'),
    (select count(*) from public.docs where collection = 'notes' and id like 'tst-%'),
    (select count(*) from public.docs where collection = 'members' and id in (a::text, b::text, c::text)),
    (select count(*) from public.profiles where id in (o, a, b, c))) || E'\n';
  execute 'reset role';

  -- OWNER widens scout B with an override: sees all players
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', o::text, true);
  execute 'set local role authenticated';
  perform public.doc_patch('members', b::text, '{"overrides":{"players.view":true}}');
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', b::text, true);
  execute 'set local role authenticated';
  out := out || format('scout B + "view all players": test players=%s (expect 7)',
    (select count(*) from public.docs where collection = 'players' and id like 'tst-%')) || E'\n';
  execute 'reset role';

  raise exception E'RLS SCOPE TEST RESULTS (rolled back)\n%', out;
end;
$$;
