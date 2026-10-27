-- Privilege tests for voice overage billing: 20261027100000_voice_overage_charges.sql.
--   • RLS on, no client write privilege, anon reads nothing, the service role writes;
--   • a member reads their own org's charges — never another org's;
--   • one row per org per month; month must be the 1st; status / scope / minutes checked;
--   • `updated_at` moves on update; a deleted org takes its rows.
\set ON_ERROR_STOP on
set client_min_messages = notice;
reset role;

do $$
declare
  r text;
  p text;
begin
  raise notice '== voice_overage_charges: RLS on, no client writes';
  if not (select relrowsecurity from pg_class where oid = 'public.voice_overage_charges'::regclass) then
    raise exception 'FAIL voice_overage_charges has RLS off';
  end if;
  foreach r in array array['anon','authenticated'] loop
    foreach p in array array['INSERT','UPDATE','DELETE'] loop
      if has_table_privilege(r, 'public.voice_overage_charges', p) then
        raise exception 'FAIL % has % on voice_overage_charges', r, p;
      end if;
    end loop;
  end loop;
  if has_table_privilege('anon', 'public.voice_overage_charges', 'SELECT') then
    raise exception 'FAIL anon can read voice_overage_charges';
  end if;
  if not has_table_privilege('service_role', 'public.voice_overage_charges', 'INSERT') then
    raise exception 'FAIL service_role cannot write voice_overage_charges';
  end if;
  raise notice 'ok   RLS on, no client insert/update/delete, anon reads nothing, service role writes';
end $$;

-- ── Fixture: two orgs; a member of the first ─────────────────────────────────────────
insert into auth.users (id, email) values ('0d100000-0000-4000-8000-000000000001', 'owner@overage.test') on conflict do nothing;
insert into public.profiles (id, email, full_name) values ('0d100000-0000-4000-8000-000000000001', 'owner@overage.test', 'Owner Overage') on conflict do nothing;
insert into public.organizations (id, name, slug) values
  ('0d200000-0000-4000-8000-000000000001', 'Overage Test', 'overage-test'),
  ('0d200000-0000-4000-8000-000000000002', 'Overage Other', 'overage-other')
on conflict do nothing;
insert into public.organization_memberships (organization_id, profile_id, role) values
  ('0d200000-0000-4000-8000-000000000001', '0d100000-0000-4000-8000-000000000001', 'member')
on conflict do nothing;
update public.organization_memberships set role = 'member' where organization_id = '0d200000-0000-4000-8000-000000000001' and profile_id = '0d100000-0000-4000-8000-000000000001';
insert into public.voice_overage_charges (organization_id, month, scope, included_minutes, used_minutes, overage_minutes, status) values
  ('0d200000-0000-4000-8000-000000000001', '2026-09-01', 'organization', 500, 530.4, 31, 'charged'),
  ('0d200000-0000-4000-8000-000000000002', '2026-09-01', 'company', 100, 150, 50, 'skipped')
on conflict do nothing;

-- ── A member reads only their org ───────────────────────────────────────────────────
set role authenticated;
select set_config('request.jwt.claim.sub', '0d100000-0000-4000-8000-000000000001', false);
do $$
declare n int;
begin
  select count(*) into n from public.voice_overage_charges;
  if n <> 1 then raise exception 'FAIL member sees % overage rows (expected 1)', n; end if;
  if exists (select 1 from public.voice_overage_charges where organization_id = '0d200000-0000-4000-8000-000000000002') then
    raise exception 'FAIL member reads another org''s overage';
  end if;
  begin
    update public.voice_overage_charges set status = 'recorded';
    raise exception 'FAIL member could update voice_overage_charges';
  exception when insufficient_privilege then null;
  end;
  raise notice 'ok   a member reads their own org''s charge only and cannot write';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);

-- ── Constraints ─────────────────────────────────────────────────────────────────────
do $$
declare
  before timestamptz;
  after timestamptz;
begin
  begin
    insert into public.voice_overage_charges (organization_id, month, scope, included_minutes, used_minutes, overage_minutes, status)
      values ('0d200000-0000-4000-8000-000000000001', '2026-09-01', 'organization', 500, 600, 100, 'charging');
    raise exception 'FAIL a second row for the same org + month';
  exception when unique_violation then null;
  end;
  begin
    insert into public.voice_overage_charges (organization_id, month, scope, included_minutes, used_minutes, overage_minutes, status)
      values ('0d200000-0000-4000-8000-000000000001', '2026-08-15', 'organization', 500, 600, 100, 'charging');
    raise exception 'FAIL a month that isn''t the 1st';
  exception when check_violation then null;
  end;
  begin
    insert into public.voice_overage_charges (organization_id, month, scope, included_minutes, used_minutes, overage_minutes, status)
      values ('0d200000-0000-4000-8000-000000000001', '2026-08-01', 'organization', 500, 600, 100, 'paid');
    raise exception 'FAIL a junk status';
  exception when check_violation then null;
  end;
  begin
    insert into public.voice_overage_charges (organization_id, month, scope, included_minutes, used_minutes, overage_minutes, status)
      values ('0d200000-0000-4000-8000-000000000001', '2026-08-01', 'organization', 500, 500, 0, 'recorded');
    raise exception 'FAIL zero overage minutes';
  exception when check_violation then null;
  end;
  begin
    insert into public.voice_overage_charges (organization_id, month, scope, included_minutes, used_minutes, overage_minutes, status)
      values ('0d200000-0000-4000-8000-000000000001', '2026-08-01', 'tenant', 500, 600, 100, 'recorded');
    raise exception 'FAIL a junk scope';
  exception when check_violation then null;
  end;
  raise notice 'ok   one row per org + month; month on the 1st; status / scope / minutes checked';

  select updated_at into before from public.voice_overage_charges where organization_id = '0d200000-0000-4000-8000-000000000002';
  perform pg_sleep(0.01);
  update public.voice_overage_charges set status = 'failed', attempts = 1 where organization_id = '0d200000-0000-4000-8000-000000000002';
  select updated_at into after from public.voice_overage_charges where organization_id = '0d200000-0000-4000-8000-000000000002';
  if after <= before then raise exception 'FAIL updated_at did not move'; end if;
  raise notice 'ok   updated_at moves on update';

  delete from public.organizations where id = '0d200000-0000-4000-8000-000000000002';
  if exists (select 1 from public.voice_overage_charges where organization_id = '0d200000-0000-4000-8000-000000000002') then
    raise exception 'FAIL a deleted org left its overage rows';
  end if;
  raise notice 'ok   a deleted org takes its rows';
end $$;
