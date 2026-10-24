-- Privilege tests for owner call requests: 20261023100000_owner_call_requests.sql.
--   • the table has RLS on and no client write privilege; anon reads nothing;
--   • a member reads their own org's requests — never another org's; the service role writes;
--   • one open request (proposed / scheduled / dialing) per customer per company, while a
--     completed one doesn't block a new one; a junk status / owner phone is refused;
--   • the contact must belong to the same organization (composite FK); a deleted approval
--     leaves the request (approval_id set null); a deleted contact takes its requests;
--   • `updated_at` moves on update.
\set ON_ERROR_STOP on
set client_min_messages = notice;
reset role;

do $$
declare
  r text;
  p text;
begin
  raise notice '== owner_call_requests: RLS on, no client writes';
  if not (select relrowsecurity from pg_class where oid = 'public.owner_call_requests'::regclass) then
    raise exception 'FAIL owner_call_requests has RLS off';
  end if;
  foreach r in array array['anon','authenticated'] loop
    foreach p in array array['INSERT','UPDATE','DELETE'] loop
      if has_table_privilege(r, 'public.owner_call_requests', p) then
        raise exception 'FAIL % has % on owner_call_requests', r, p;
      end if;
    end loop;
  end loop;
  if has_table_privilege('anon', 'public.owner_call_requests', 'SELECT') then
    raise exception 'FAIL anon can read owner_call_requests';
  end if;
  if not has_table_privilege('service_role', 'public.owner_call_requests', 'INSERT') then
    raise exception 'FAIL service_role cannot write owner_call_requests';
  end if;
  raise notice 'ok   RLS on, no client insert/update/delete, anon reads nothing, service role writes';
end $$;

-- ── Fixture: two orgs; a member of the first; a customer in each ──────────────────────
insert into auth.users (id, email) values ('0c100000-0000-4000-8000-000000000001', 'owner@calls.test') on conflict do nothing;
insert into public.profiles (id, email, full_name) values ('0c100000-0000-4000-8000-000000000001', 'owner@calls.test', 'Marcus Owner') on conflict do nothing;
insert into public.organizations (id, name, slug) values
  ('0c200000-0000-4000-8000-000000000001', 'Calls Test', 'calls-test'),
  ('0c200000-0000-4000-8000-000000000002', 'Other Org', 'calls-other')
on conflict do nothing;
insert into public.organization_memberships (organization_id, profile_id, role) values
  ('0c200000-0000-4000-8000-000000000001', '0c100000-0000-4000-8000-000000000001', 'member')
on conflict do nothing;
update public.organization_memberships set role = 'member' where organization_id = '0c200000-0000-4000-8000-000000000001' and profile_id = '0c100000-0000-4000-8000-000000000001';
insert into public.companies (id, organization_id, name, slug) values
  ('0c300000-0000-4000-8000-000000000001', '0c200000-0000-4000-8000-000000000001', 'Northshore', 'northshore-calls'),
  ('0c300000-0000-4000-8000-000000000002', '0c200000-0000-4000-8000-000000000002', 'Elsewhere', 'elsewhere-calls')
on conflict do nothing;
insert into public.contacts (id, organization_id, company_id, first_name, phone) values
  ('0c400000-0000-4000-8000-000000000001', '0c200000-0000-4000-8000-000000000001', '0c300000-0000-4000-8000-000000000001', 'Dana', '+17055550123'),
  ('0c400000-0000-4000-8000-000000000002', '0c200000-0000-4000-8000-000000000002', '0c300000-0000-4000-8000-000000000002', 'Secret', '+14165550000')
on conflict do nothing;
insert into public.owner_approvals (id, organization_id, company_id, contact_id, kind, summary, short_code) values
  ('0c500000-0000-4000-8000-000000000001', '0c200000-0000-4000-8000-000000000001', '0c300000-0000-4000-8000-000000000001', '0c400000-0000-4000-8000-000000000001', 'owner_command', 'Call Dana?', 7)
on conflict do nothing;
insert into public.owner_call_requests (id, organization_id, company_id, contact_id, approval_id, requested_by_phone, brief, status) values
  ('0c600000-0000-4000-8000-000000000001', '0c200000-0000-4000-8000-000000000001', '0c300000-0000-4000-8000-000000000001', '0c400000-0000-4000-8000-000000000001', '0c500000-0000-4000-8000-000000000001', '+17055559999', '{"purpose":"the lift is fixed","askFor":null,"ifVoicemail":"leave_message","who":"Dana"}', 'proposed'),
  ('0c600000-0000-4000-8000-000000000002', '0c200000-0000-4000-8000-000000000002', '0c300000-0000-4000-8000-000000000002', '0c400000-0000-4000-8000-000000000002', null, '+14165559999', '{"purpose":"x","askFor":null,"ifVoicemail":"leave_message","who":"Secret"}', 'completed')
on conflict do nothing;

-- A member: reads their own org's requests, not another org's; can't write.
set role authenticated;
select set_config('request.jwt.claim.sub', '0c100000-0000-4000-8000-000000000001', false);
do $$
begin
  if (select count(*) from public.owner_call_requests) <> 1 or exists (select 1 from public.owner_call_requests where organization_id <> '0c200000-0000-4000-8000-000000000001') then
    raise exception 'FAIL member sees % call requests (want 1, own org only)', (select count(*) from public.owner_call_requests);
  end if;
  raise notice 'ok   member: own org''s call requests only';
  begin
    update public.owner_call_requests set status = 'cancelled';
    raise exception 'FAIL member updated owner_call_requests';
  exception when insufficient_privilege then
    raise notice 'ok   denied: member update owner_call_requests';
  end;
  begin
    insert into public.owner_call_requests (organization_id, company_id, contact_id, requested_by_phone, brief) values ('0c200000-0000-4000-8000-000000000001', '0c300000-0000-4000-8000-000000000001', '0c400000-0000-4000-8000-000000000001', '+17055559999', '{}');
    raise exception 'FAIL member inserted owner_call_requests';
  exception when insufficient_privilege then
    raise notice 'ok   denied: member insert owner_call_requests';
  end;
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);

-- Constraints.
do $$
declare
  before_ts timestamptz;
  after_ts timestamptz;
begin
  begin
    insert into public.owner_call_requests (organization_id, company_id, contact_id, requested_by_phone, brief, status) values ('0c200000-0000-4000-8000-000000000001', '0c300000-0000-4000-8000-000000000001', '0c400000-0000-4000-8000-000000000001', '+17055559999', '{}', 'scheduled');
    raise exception 'FAIL two open requests for one customer';
  exception when unique_violation then
    raise notice 'ok   one open request per customer per company';
  end;
  -- A finished one doesn't block a new one.
  insert into public.owner_call_requests (id, organization_id, company_id, contact_id, requested_by_phone, brief, status) values ('0c600000-0000-4000-8000-000000000003', '0c200000-0000-4000-8000-000000000002', '0c300000-0000-4000-8000-000000000002', '0c400000-0000-4000-8000-000000000002', '+14165559999', '{}', 'proposed') on conflict (id) do nothing;
  raise notice 'ok   a completed request doesn''t block a new one';
  begin
    insert into public.owner_call_requests (organization_id, company_id, contact_id, requested_by_phone, brief, status) values ('0c200000-0000-4000-8000-000000000002', '0c300000-0000-4000-8000-000000000002', '0c400000-0000-4000-8000-000000000002', '+14165559999', '{}', 'ringing');
    raise exception 'FAIL a junk status was accepted';
  exception when check_violation then
    raise notice 'ok   status checked';
  end;
  begin
    insert into public.owner_call_requests (organization_id, company_id, contact_id, requested_by_phone, brief) values ('0c200000-0000-4000-8000-000000000002', '0c300000-0000-4000-8000-000000000002', '0c400000-0000-4000-8000-000000000002', '416-555-9999', '{}');
    raise exception 'FAIL a non-E.164 owner phone was accepted';
  exception when check_violation then
    raise notice 'ok   requested_by_phone is E.164';
  end;
  begin
    -- Dana belongs to the first org; the second org can't file a request against her.
    insert into public.owner_call_requests (organization_id, company_id, contact_id, requested_by_phone, brief) values ('0c200000-0000-4000-8000-000000000002', '0c300000-0000-4000-8000-000000000002', '0c400000-0000-4000-8000-000000000001', '+14165559999', '{}');
    raise exception 'FAIL a request for another org''s contact was accepted';
  exception when foreign_key_violation then
    raise notice 'ok   contact must belong to the same organization (composite FK)';
  end;
  select updated_at into before_ts from public.owner_call_requests where id = '0c600000-0000-4000-8000-000000000001';
  perform pg_sleep(0.01);
  update public.owner_call_requests set status = 'scheduled' where id = '0c600000-0000-4000-8000-000000000001';
  select updated_at into after_ts from public.owner_call_requests where id = '0c600000-0000-4000-8000-000000000001';
  if after_ts <= before_ts then raise exception 'FAIL updated_at did not move'; end if;
  raise notice 'ok   updated_at trigger';
  delete from public.owner_approvals where id = '0c500000-0000-4000-8000-000000000001';
  if (select approval_id from public.owner_call_requests where id = '0c600000-0000-4000-8000-000000000001') is not null then raise exception 'FAIL approval_id not set null'; end if;
  raise notice 'ok   a deleted approval leaves the request (approval_id null)';
  delete from public.contacts where id = '0c400000-0000-4000-8000-000000000002';
  if exists (select 1 from public.owner_call_requests where contact_id = '0c400000-0000-4000-8000-000000000002') then raise exception 'FAIL requests survived their contact'; end if;
  raise notice 'ok   a deleted contact takes its requests';
end $$;

-- Cleanup.
delete from public.owner_call_requests where organization_id in ('0c200000-0000-4000-8000-000000000001', '0c200000-0000-4000-8000-000000000002');
delete from public.contacts where organization_id in ('0c200000-0000-4000-8000-000000000001', '0c200000-0000-4000-8000-000000000002');
delete from public.companies where organization_id in ('0c200000-0000-4000-8000-000000000001', '0c200000-0000-4000-8000-000000000002');
delete from public.organization_memberships where organization_id in ('0c200000-0000-4000-8000-000000000001', '0c200000-0000-4000-8000-000000000002');
delete from public.organizations where id in ('0c200000-0000-4000-8000-000000000001', '0c200000-0000-4000-8000-000000000002');
