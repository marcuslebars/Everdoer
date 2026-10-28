-- Privilege tests for agent memory: 20261028100000_agent_memory.sql.
--   • agent_turns / agent_notes: RLS on, no client writes, anon reads nothing, service role writes;
--   • turns: owner/admin read their org's only (a member reads none);
--   • notes: members read their org's (never another org's); archived rows stay readable;
--   • notes: empty / >500-char bodies and junk sources refused; the contact must be the same
--     org's (composite FK); a deleted contact takes its notes; updated_at moves.
\set ON_ERROR_STOP on
set client_min_messages = notice;
reset role;

do $$
declare
  t text;
  r text;
  p text;
begin
  raise notice '== agent memory: RLS on, no client writes';
  foreach t in array array['public.agent_turns','public.agent_notes'] loop
    if not (select relrowsecurity from pg_class where oid = t::regclass) then raise exception 'FAIL % has RLS off', t; end if;
    foreach r in array array['anon','authenticated'] loop
      foreach p in array array['INSERT','UPDATE','DELETE'] loop
        if has_table_privilege(r, t, p) then raise exception 'FAIL % has % on %', r, p, t; end if;
      end loop;
    end loop;
    if has_table_privilege('anon', t, 'SELECT') then raise exception 'FAIL anon can read %', t; end if;
  end loop;
  raise notice 'ok   both tables: RLS on, no client insert/update/delete, anon reads nothing';
end $$;

insert into auth.users (id, email) values
  ('0a100000-0000-4000-8000-000000000001', 'admin@mem.test'),
  ('0a100000-0000-4000-8000-000000000002', 'member@mem.test')
on conflict do nothing;
insert into public.profiles (id, email, full_name) values
  ('0a100000-0000-4000-8000-000000000001', 'admin@mem.test', 'Mem Admin'),
  ('0a100000-0000-4000-8000-000000000002', 'member@mem.test', 'Mem Member')
on conflict do nothing;
insert into public.organizations (id, name, slug) values
  ('0a200000-0000-4000-8000-000000000001', 'Mem Test', 'mem-test'),
  ('0a200000-0000-4000-8000-000000000002', 'Mem Other', 'mem-other')
on conflict do nothing;
insert into public.organization_memberships (organization_id, profile_id, role) values
  ('0a200000-0000-4000-8000-000000000001', '0a100000-0000-4000-8000-000000000001', 'admin'),
  ('0a200000-0000-4000-8000-000000000001', '0a100000-0000-4000-8000-000000000002', 'member')
on conflict do nothing;
update public.organization_memberships set role = 'admin' where organization_id = '0a200000-0000-4000-8000-000000000001' and profile_id = '0a100000-0000-4000-8000-000000000001';
update public.organization_memberships set role = 'member' where organization_id = '0a200000-0000-4000-8000-000000000001' and profile_id = '0a100000-0000-4000-8000-000000000002';
insert into public.companies (id, organization_id, name, slug) values
  ('0a300000-0000-4000-8000-000000000001', '0a200000-0000-4000-8000-000000000001', 'Northshore', 'northshore-mem'),
  ('0a300000-0000-4000-8000-000000000002', '0a200000-0000-4000-8000-000000000002', 'Elsewhere', 'elsewhere-mem')
on conflict do nothing;
insert into public.contacts (id, organization_id, company_id, first_name, phone) values
  ('0a400000-0000-4000-8000-000000000001', '0a200000-0000-4000-8000-000000000001', '0a300000-0000-4000-8000-000000000001', 'Dana', '+17055550111'),
  ('0a400000-0000-4000-8000-000000000002', '0a200000-0000-4000-8000-000000000002', '0a300000-0000-4000-8000-000000000002', 'Other', '+14165550112')
on conflict do nothing;
insert into public.agent_turns (organization_id, company_id, channel, thread_key, user_text, reply) values
  ('0a200000-0000-4000-8000-000000000001', '0a300000-0000-4000-8000-000000000001', 'owner_sms', '+17055559999', 'tell Dana 3pm', 'Send to Dana…'),
  ('0a200000-0000-4000-8000-000000000002', '0a300000-0000-4000-8000-000000000002', 'owner_sms', '+14165550000', 'secret', 'x');
insert into public.agent_notes (id, organization_id, company_id, contact_id, body) values
  ('0a500000-0000-4000-8000-000000000001', '0a200000-0000-4000-8000-000000000001', '0a300000-0000-4000-8000-000000000001', null, 'Closed Dec 24 - Jan 2'),
  ('0a500000-0000-4000-8000-000000000002', '0a200000-0000-4000-8000-000000000001', '0a300000-0000-4000-8000-000000000001', '0a400000-0000-4000-8000-000000000001', 'Prefers mornings'),
  ('0a500000-0000-4000-8000-000000000003', '0a200000-0000-4000-8000-000000000002', '0a300000-0000-4000-8000-000000000002', null, 'Other secret');

set role authenticated;
select set_config('request.jwt.claim.sub', '0a100000-0000-4000-8000-000000000001', false);
do $$
begin
  if (select count(*) from public.agent_turns) <> 1 then raise exception 'FAIL admin sees % turns (expected 1)', (select count(*) from public.agent_turns); end if;
  if (select count(*) from public.agent_notes) <> 2 then raise exception 'FAIL admin sees % notes (expected 2)', (select count(*) from public.agent_notes); end if;
  raise notice 'ok   an admin reads their own org''s turns and notes only';
end $$;
select set_config('request.jwt.claim.sub', '0a100000-0000-4000-8000-000000000002', false);
do $$
begin
  if (select count(*) from public.agent_turns) <> 0 then raise exception 'FAIL a member reads the owner''s turns'; end if;
  if (select count(*) from public.agent_notes) <> 2 then raise exception 'FAIL a member sees % notes (expected 2)', (select count(*) from public.agent_notes); end if;
  if exists (select 1 from public.agent_notes where body = 'Other secret') then raise exception 'FAIL a member reads another org''s notes'; end if;
  begin
    update public.agent_notes set body = 'hacked';
    raise exception 'FAIL a member could update notes';
  exception when insufficient_privilege then null;
  end;
  raise notice 'ok   a member reads their org''s notes (no turns) and cannot write';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);

do $$
declare
  before timestamptz;
  after timestamptz;
begin
  begin
    insert into public.agent_notes (organization_id, company_id, body) values ('0a200000-0000-4000-8000-000000000001', '0a300000-0000-4000-8000-000000000001', '   ');
    raise exception 'FAIL an empty note';
  exception when check_violation then null;
  end;
  begin
    insert into public.agent_notes (organization_id, company_id, body) values ('0a200000-0000-4000-8000-000000000001', '0a300000-0000-4000-8000-000000000001', repeat('x', 501));
    raise exception 'FAIL a note over 500 characters';
  exception when check_violation then null;
  end;
  begin
    insert into public.agent_notes (organization_id, company_id, body, source) values ('0a200000-0000-4000-8000-000000000001', '0a300000-0000-4000-8000-000000000001', 'x', 'fax');
    raise exception 'FAIL a junk source';
  exception when check_violation then null;
  end;
  begin
    insert into public.agent_notes (organization_id, company_id, contact_id, body) values ('0a200000-0000-4000-8000-000000000001', '0a300000-0000-4000-8000-000000000001', '0a400000-0000-4000-8000-000000000002', 'cross-org contact');
    raise exception 'FAIL a note about another org''s contact';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into public.agent_turns (organization_id, company_id, channel, thread_key) values ('0a200000-0000-4000-8000-000000000001', '0a300000-0000-4000-8000-000000000002', 'owner_sms', '+1');
    raise exception 'FAIL a turn for another org''s company';
  exception when foreign_key_violation then null;
  end;
  raise notice 'ok   bodies, sources and cross-org links refused';

  select updated_at into before from public.agent_notes where id = '0a500000-0000-4000-8000-000000000001';
  perform pg_sleep(0.01);
  update public.agent_notes set archived_at = now() where id = '0a500000-0000-4000-8000-000000000001';
  select updated_at into after from public.agent_notes where id = '0a500000-0000-4000-8000-000000000001';
  if after <= before then raise exception 'FAIL updated_at did not move'; end if;
  delete from public.contacts where id = '0a400000-0000-4000-8000-000000000001';
  if exists (select 1 from public.agent_notes where id = '0a500000-0000-4000-8000-000000000002') then raise exception 'FAIL a deleted contact left its notes'; end if;
  raise notice 'ok   updated_at moves; a deleted contact takes its notes';
end $$;
