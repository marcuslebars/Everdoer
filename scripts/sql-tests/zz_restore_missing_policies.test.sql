-- 20261103100000_restore_missing_policies.sql: a member marks a conversation read (insert,
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
drop policy if exists "onboarding_progress_members_select" on public.onboarding_progress;
drop policy if exists "onboarding_progress_members_insert" on public.onboarding_progress;
drop policy if exists "onboarding_progress_members_update" on public.onboarding_progress;
drop policy if exists "onboarding_events_members_select" on public.onboarding_events;
drop policy if exists "onboarding_events_members_insert" on public.onboarding_events;

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
\i supabase/migrations/20261103100000_restore_missing_policies.sql

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

-- Onboarding: a member saves a step (upsert, as the wizard does) and logs an event; an outsider
-- can't, and can't see the org's progress.
create or replace function pg_temp.save_step(who uuid, org uuid) returns text language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', who::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
  insert into public.onboarding_progress (organization_id, company_id, step, status, updated_at)
  values (org, '00000000-0000-0000-0000-0000000c5c01', 'business', 'complete', now())
  on conflict (organization_id, company_id, step) do update
    set status = excluded.status, updated_at = excluded.updated_at;
  insert into public.onboarding_events (organization_id, company_id, step, event)
  values (org, '00000000-0000-0000-0000-0000000c5c01', 'business', 'complete');
  execute 'reset role';
  return 'ok';
exception when insufficient_privilege then
  execute 'reset role';
  return 'refused';
end $$;

do $$
declare n int;
begin
  if pg_temp.save_step('00000000-0000-0000-0000-00000000c5a2', '00000000-0000-0000-0000-0000000c5aaa') <> 'ok' then
    raise exception 'FAIL member could not save an onboarding step';
  end if;
  if pg_temp.save_step('00000000-0000-0000-0000-00000000c5a2', '00000000-0000-0000-0000-0000000c5aaa') <> 'ok' then
    raise exception 'FAIL member could not re-save an onboarding step (conflict path)';
  end if;
  raise notice 'ok   member saves an onboarding step twice and logs events';
  if pg_temp.save_step('00000000-0000-0000-0000-00000000c5b1', '00000000-0000-0000-0000-0000000c5aaa') <> 'refused' then
    raise exception 'FAIL outsider saved onboarding progress into another org';
  end if;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000c5b1', true);
  set local role authenticated;
  select count(*) into n from public.onboarding_progress where organization_id = '00000000-0000-0000-0000-0000000c5aaa';
  reset role;
  if n <> 0 then raise exception 'FAIL outsider sees % onboarding rows of another org', n; end if;
  raise notice 'ok   outsider refused and sees nothing';
end $$;
