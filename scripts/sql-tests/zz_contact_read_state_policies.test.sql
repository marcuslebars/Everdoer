-- 20261103100000_contact_read_state_policies.sql: a member marks a conversation read (insert,
-- then again on conflict) as PostgREST does; nobody can write or see another member's marker,
-- or write into an org they don't belong to. Also simulates production's state (policies
-- missing) and re-applies the migration to prove it repairs it.
\set ON_ERROR_STOP on
set client_min_messages = warning;

reset role;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000c5a1', 'reader1@crs.test'),
  ('00000000-0000-0000-0000-00000000c5a2', 'reader2@crs.test'),
  ('00000000-0000-0000-0000-00000000c5b1', 'outsider@crs.test')
on conflict do nothing;
insert into public.organizations (id, name, slug, plan, subscription_status, created_by) values
  ('00000000-0000-0000-0000-0000000c5aaa', 'CRS Org A', 'crs-org-a', 'launch', 'active', '00000000-0000-0000-0000-00000000c5a1'),
  ('00000000-0000-0000-0000-0000000c5bbb', 'CRS Org B', 'crs-org-b', 'launch', 'active', '00000000-0000-0000-0000-00000000c5b1')
on conflict do nothing;
insert into public.organization_memberships (organization_id, profile_id, role) values
  ('00000000-0000-0000-0000-0000000c5aaa', '00000000-0000-0000-0000-00000000c5a1', 'owner'),
  ('00000000-0000-0000-0000-0000000c5aaa', '00000000-0000-0000-0000-00000000c5a2', 'member'),
  ('00000000-0000-0000-0000-0000000c5bbb', '00000000-0000-0000-0000-00000000c5b1', 'owner')
on conflict do nothing;
insert into public.companies (id, organization_id, name, slug) values
  ('00000000-0000-0000-0000-0000000c5c01', '00000000-0000-0000-0000-0000000c5aaa', 'CRS Brand', 'crs-brand')
on conflict do nothing;
insert into public.contacts (id, organization_id, company_id, first_name) values
  ('00000000-0000-0000-0000-0000000c5d01', '00000000-0000-0000-0000-0000000c5aaa', '00000000-0000-0000-0000-0000000c5c01', 'Dana')
on conflict do nothing;

set client_min_messages = notice;

-- Production's broken state: RLS on, no policies → the member's write is refused.
drop policy if exists "contact_read_state_self_select" on public.contact_read_state;
drop policy if exists "contact_read_state_self_insert" on public.contact_read_state;
drop policy if exists "contact_read_state_self_update" on public.contact_read_state;

create or replace function pg_temp.mark_read(who uuid, org uuid) returns text language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', who::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
  insert into public.contact_read_state (organization_id, contact_id, profile_id, last_read_at)
  values (org, '00000000-0000-0000-0000-0000000c5d01', who, now())
  on conflict (contact_id, profile_id) do update
    set organization_id = excluded.organization_id, contact_id = excluded.contact_id,
        profile_id = excluded.profile_id, last_read_at = excluded.last_read_at;
  execute 'reset role';
  return 'ok';
exception when insufficient_privilege then
  execute 'reset role';
  return 'refused';
end $$;

do $$ begin
  if pg_temp.mark_read('00000000-0000-0000-0000-00000000c5a1', '00000000-0000-0000-0000-0000000c5aaa') <> 'refused' then
    raise exception 'FAIL setup: with no policies the write should be refused (production state)';
  end if;
  raise notice 'ok   production state reproduced: no policies → refused';
end $$;

-- Re-apply the repair migration.
\i supabase/migrations/20261103100000_contact_read_state_policies.sql

do $$
declare n int;
begin
  if pg_temp.mark_read('00000000-0000-0000-0000-00000000c5a1', '00000000-0000-0000-0000-0000000c5aaa') <> 'ok' then
    raise exception 'FAIL member could not mark read (insert path)';
  end if;
  if pg_temp.mark_read('00000000-0000-0000-0000-00000000c5a1', '00000000-0000-0000-0000-0000000c5aaa') <> 'ok' then
    raise exception 'FAIL member could not mark read again (conflict path)';
  end if;
  raise notice 'ok   member marks read, twice (insert + on conflict)';

  if pg_temp.mark_read('00000000-0000-0000-0000-00000000c5b1', '00000000-0000-0000-0000-0000000c5aaa') <> 'refused' then
    raise exception 'FAIL an outsider wrote a marker into an org they are not in';
  end if;
  raise notice 'ok   outsider refused';

  -- Writing a marker for someone else is refused even inside your own org.
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000c5a2', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;
  begin
    insert into public.contact_read_state (organization_id, contact_id, profile_id)
    values ('00000000-0000-0000-0000-0000000c5aaa', '00000000-0000-0000-0000-0000000c5d01', '00000000-0000-0000-0000-00000000c5a1')
    on conflict (contact_id, profile_id) do update set last_read_at = now();
    raise exception 'FAIL member wrote another member''s marker';
  exception when insufficient_privilege then
    raise notice 'ok   another member''s marker refused';
  end;
  select count(*) into n from public.contact_read_state;
  if n <> 0 then raise exception 'FAIL member 2 can see % markers that are not theirs', n; end if;
  raise notice 'ok   another member''s marker is invisible';
  reset role;
end $$;
