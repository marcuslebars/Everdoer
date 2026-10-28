-- Privilege tests for the agent run log: 20261027120000_agent_runs.sql.
--   • RLS on, no client write privilege, anon reads nothing, the service role writes;
--   • an owner/admin reads their own org's runs; a member reads none; another org's admin none;
--   • channel / status checked; a deleted org takes its runs.
\set ON_ERROR_STOP on
set client_min_messages = notice;
reset role;

do $$
declare
  r text;
  p text;
begin
  raise notice '== agent_runs: RLS on, no client writes';
  if not (select relrowsecurity from pg_class where oid = 'public.agent_runs'::regclass) then
    raise exception 'FAIL agent_runs has RLS off';
  end if;
  foreach r in array array['anon','authenticated'] loop
    foreach p in array array['INSERT','UPDATE','DELETE'] loop
      if has_table_privilege(r, 'public.agent_runs', p) then
        raise exception 'FAIL % has % on agent_runs', r, p;
      end if;
    end loop;
  end loop;
  if has_table_privilege('anon', 'public.agent_runs', 'SELECT') then
    raise exception 'FAIL anon can read agent_runs';
  end if;
  raise notice 'ok   RLS on, no client insert/update/delete, anon reads nothing';
end $$;

insert into auth.users (id, email) values
  ('0f100000-0000-4000-8000-000000000001', 'admin@runs.test'),
  ('0f100000-0000-4000-8000-000000000002', 'member@runs.test')
on conflict do nothing;
insert into public.profiles (id, email, full_name) values
  ('0f100000-0000-4000-8000-000000000001', 'admin@runs.test', 'Runs Admin'),
  ('0f100000-0000-4000-8000-000000000002', 'member@runs.test', 'Runs Member')
on conflict do nothing;
insert into public.organizations (id, name, slug) values
  ('0f200000-0000-4000-8000-000000000001', 'Runs Test', 'runs-test'),
  ('0f200000-0000-4000-8000-000000000002', 'Runs Other', 'runs-other')
on conflict do nothing;
insert into public.organization_memberships (organization_id, profile_id, role) values
  ('0f200000-0000-4000-8000-000000000001', '0f100000-0000-4000-8000-000000000001', 'admin'),
  ('0f200000-0000-4000-8000-000000000001', '0f100000-0000-4000-8000-000000000002', 'member')
on conflict do nothing;
update public.organization_memberships set role = 'admin' where organization_id = '0f200000-0000-4000-8000-000000000001' and profile_id = '0f100000-0000-4000-8000-000000000001';
update public.organization_memberships set role = 'member' where organization_id = '0f200000-0000-4000-8000-000000000001' and profile_id = '0f100000-0000-4000-8000-000000000002';
insert into public.agent_runs (organization_id, channel, status, rounds, tool_calls, reply) values
  ('0f200000-0000-4000-8000-000000000001', 'owner_sms', 'final', 2, '[{"name":"list_bookings","is_error":false}]', 'Tomorrow: Thu 9am'),
  ('0f200000-0000-4000-8000-000000000002', 'customer_sms', 'final', 1, '[]', 'Secret other org');

set role authenticated;
select set_config('request.jwt.claim.sub', '0f100000-0000-4000-8000-000000000001', false);
do $$
begin
  if (select count(*) from public.agent_runs) <> 1 then raise exception 'FAIL admin sees % runs (expected 1)', (select count(*) from public.agent_runs); end if;
  if exists (select 1 from public.agent_runs where reply = 'Secret other org') then raise exception 'FAIL admin reads another org''s runs'; end if;
  raise notice 'ok   an admin reads their own org''s runs only';
end $$;
select set_config('request.jwt.claim.sub', '0f100000-0000-4000-8000-000000000002', false);
do $$
begin
  if (select count(*) from public.agent_runs) <> 0 then raise exception 'FAIL a member reads agent runs'; end if;
  begin
    insert into public.agent_runs (organization_id, channel, status) values ('0f200000-0000-4000-8000-000000000001', 'owner_sms', 'final');
    raise exception 'FAIL a member could insert a run';
  exception when insufficient_privilege then null;
  end;
  raise notice 'ok   a member reads nothing and cannot write';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);

do $$
begin
  begin
    insert into public.agent_runs (organization_id, channel, status) values ('0f200000-0000-4000-8000-000000000001', 'fax', 'final');
    raise exception 'FAIL a junk channel';
  exception when check_violation then null;
  end;
  begin
    insert into public.agent_runs (organization_id, channel, status) values ('0f200000-0000-4000-8000-000000000001', 'voice', 'maybe');
    raise exception 'FAIL a junk status';
  exception when check_violation then null;
  end;
  delete from public.organizations where id = '0f200000-0000-4000-8000-000000000002';
  if exists (select 1 from public.agent_runs where organization_id = '0f200000-0000-4000-8000-000000000002') then
    raise exception 'FAIL a deleted org left its runs';
  end if;
  raise notice 'ok   channel / status checked; a deleted org takes its runs';
end $$;
