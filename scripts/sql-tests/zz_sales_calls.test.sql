-- Privilege + shape tests for 20261029100000_sales_calls.sql.
--   • call_consents / do_not_call / sales_calls: RLS on, no client writes, anon reads nothing;
--   • members read their org's rows only;
--   • one open sales call per customer; junk reasons / statuses / sources / numbers refused;
--   • a contact must be the same org's (composite FK); do_not_call is unique per company + number;
--   • companies.sales_call_settings defaults to {}.
\set ON_ERROR_STOP on
set client_min_messages = notice;
reset role;
select set_config('request.jwt.claim.sub', '', false);

do $$
declare
  t text;
  r text;
  p text;
begin
  raise notice '== sales calls: RLS on, no client writes';
  foreach t in array array['public.call_consents','public.do_not_call','public.sales_calls'] loop
    if not (select relrowsecurity from pg_class where oid = t::regclass) then raise exception 'FAIL % has RLS off', t; end if;
    foreach r in array array['anon','authenticated'] loop
      foreach p in array array['INSERT','UPDATE','DELETE'] loop
        if has_table_privilege(r, t, p) then raise exception 'FAIL % has % on %', r, p, t; end if;
      end loop;
    end loop;
    if has_table_privilege('anon', t, 'SELECT') then raise exception 'FAIL anon can read %', t; end if;
  end loop;
  raise notice 'ok   three tables: RLS on, no client insert/update/delete, anon reads nothing';
end $$;

insert into auth.users (id, email) values
  ('0b100000-0000-4000-8000-000000000001', 'member@sales.test')
on conflict do nothing;
insert into public.profiles (id, email, full_name) values
  ('0b100000-0000-4000-8000-000000000001', 'member@sales.test', 'Sales Member')
on conflict do nothing;
insert into public.organizations (id, name, slug) values
  ('0b200000-0000-4000-8000-000000000001', 'Sales Test', 'sales-test'),
  ('0b200000-0000-4000-8000-000000000002', 'Sales Other', 'sales-other')
on conflict do nothing;
insert into public.organization_memberships (organization_id, profile_id, role) values
  ('0b200000-0000-4000-8000-000000000001', '0b100000-0000-4000-8000-000000000001', 'member')
on conflict do nothing;
insert into public.companies (id, organization_id, name, slug) values
  ('0b300000-0000-4000-8000-000000000001', '0b200000-0000-4000-8000-000000000001', 'Northshore', 'northshore-sales'),
  ('0b300000-0000-4000-8000-000000000002', '0b200000-0000-4000-8000-000000000002', 'Elsewhere', 'elsewhere-sales')
on conflict do nothing;
insert into public.contacts (id, organization_id, company_id, first_name, phone) values
  ('0b400000-0000-4000-8000-000000000001', '0b200000-0000-4000-8000-000000000001', '0b300000-0000-4000-8000-000000000001', 'Dana', '+17055550111'),
  ('0b400000-0000-4000-8000-000000000002', '0b200000-0000-4000-8000-000000000002', '0b300000-0000-4000-8000-000000000002', 'Other', '+14165550112')
on conflict do nothing;

do $$
begin
  raise notice '== settings default';
  if (select sales_call_settings from public.companies where id = '0b300000-0000-4000-8000-000000000001') <> '{}'::jsonb then
    raise exception 'FAIL sales_call_settings should default to {}';
  end if;
  raise notice 'ok   companies.sales_call_settings defaults to {}';
end $$;

insert into public.call_consents (organization_id, company_id, contact_id, phone_last10, source, evidence) values
  ('0b200000-0000-4000-8000-000000000001', '0b300000-0000-4000-8000-000000000001', '0b400000-0000-4000-8000-000000000001', '7055550111', 'form_optin', 'Yes, call me'),
  ('0b200000-0000-4000-8000-000000000002', '0b300000-0000-4000-8000-000000000002', '0b400000-0000-4000-8000-000000000002', '4165550112', 'form_optin', 'Yes, call me');
insert into public.do_not_call (organization_id, company_id, phone_last10, source) values
  ('0b200000-0000-4000-8000-000000000001', '0b300000-0000-4000-8000-000000000001', '7055550999', 'call'),
  ('0b200000-0000-4000-8000-000000000002', '0b300000-0000-4000-8000-000000000002', '4165550999', 'owner');
insert into public.sales_calls (organization_id, company_id, contact_id, reason) values
  ('0b200000-0000-4000-8000-000000000001', '0b300000-0000-4000-8000-000000000001', '0b400000-0000-4000-8000-000000000001', 'speed_to_lead'),
  ('0b200000-0000-4000-8000-000000000002', '0b300000-0000-4000-8000-000000000002', '0b400000-0000-4000-8000-000000000002', 'owner_request');

do $$
begin
  raise notice '== constraints';
  begin
    insert into public.sales_calls (organization_id, company_id, contact_id, reason) values
      ('0b200000-0000-4000-8000-000000000001', '0b300000-0000-4000-8000-000000000001', '0b400000-0000-4000-8000-000000000001', 'owner_request');
    raise exception 'FAIL a second open sales call for the same customer was accepted';
  exception when unique_violation then null;
  end;
  begin
    insert into public.sales_calls (organization_id, company_id, contact_id, reason) values
      ('0b200000-0000-4000-8000-000000000001', '0b300000-0000-4000-8000-000000000001', '0b400000-0000-4000-8000-000000000002', 'speed_to_lead');
    raise exception 'FAIL another org''s contact was accepted';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into public.sales_calls (organization_id, company_id, contact_id, reason, status) values
      ('0b200000-0000-4000-8000-000000000001', '0b300000-0000-4000-8000-000000000001', '0b400000-0000-4000-8000-000000000001', 'cold_call', 'completed');
    raise exception 'FAIL a junk reason was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.call_consents (organization_id, company_id, contact_id, phone_last10, source, evidence) values
      ('0b200000-0000-4000-8000-000000000001', '0b300000-0000-4000-8000-000000000001', '0b400000-0000-4000-8000-000000000001', '555', 'form_optin', 'x');
    raise exception 'FAIL a short number was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.call_consents (organization_id, company_id, contact_id, phone_last10, source, evidence) values
      ('0b200000-0000-4000-8000-000000000001', '0b300000-0000-4000-8000-000000000001', '0b400000-0000-4000-8000-000000000001', '7055550111', 'implied', 'x');
    raise exception 'FAIL an implied consent source was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.do_not_call (organization_id, company_id, phone_last10, source) values
      ('0b200000-0000-4000-8000-000000000001', '0b300000-0000-4000-8000-000000000001', '7055550999', 'owner');
    raise exception 'FAIL a duplicate do-not-call number was accepted';
  exception when unique_violation then null;
  end;
  -- A finished call frees the slot for the next attempt.
  update public.sales_calls set status = 'completed' where contact_id = '0b400000-0000-4000-8000-000000000001';
  insert into public.sales_calls (organization_id, company_id, contact_id, reason, attempt) values
    ('0b200000-0000-4000-8000-000000000001', '0b300000-0000-4000-8000-000000000001', '0b400000-0000-4000-8000-000000000001', 'speed_to_lead', 2);
  if (select expires_at <> created_at + interval '3 years 14 days' from public.do_not_call where phone_last10 = '7055550999') then
    raise exception 'FAIL do_not_call should expire 3 years 14 days after the request';
  end if;
  raise notice 'ok   one open call per customer, same-org contacts, sources/reasons/numbers checked, DNC unique + 3y14d';
end $$;

set role authenticated;
select set_config('request.jwt.claim.sub', '0b100000-0000-4000-8000-000000000001', false);

do $$
begin
  raise notice '== member reads';
  if (select count(*) from public.sales_calls) <> 2 then raise exception 'FAIL member should see their 2 sales calls, saw %', (select count(*) from public.sales_calls); end if;
  if (select count(*) from public.call_consents) <> 1 then raise exception 'FAIL member should see 1 consent'; end if;
  if (select count(*) from public.do_not_call) <> 1 then raise exception 'FAIL member should see 1 do-not-call row'; end if;
  if exists (select 1 from public.sales_calls where organization_id = '0b200000-0000-4000-8000-000000000002') then raise exception 'FAIL member read another org''s calls'; end if;
  raise notice 'ok   members read their own org only';
end $$;

reset role;
select set_config('request.jwt.claim.sub', '', false);
