-- 20261103110000_onboarding_policies.sql: reproduces production (policies missing → the wizard's
-- write is refused), re-applies the migration, then: a member saves a step (insert, then on
-- conflict, as the wizard upserts) and logs an event; an outsider is refused and sees nothing.
\set ON_ERROR_STOP on
set client_min_messages = warning;

reset role;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000d6a1', 'owner@obp.test'),
  ('00000000-0000-0000-0000-00000000d6b1', 'outsider@obp.test')
on conflict do nothing;
insert into public.organizations (id, name, slug, plan, subscription_status, created_by) values
  ('00000000-0000-0000-0000-0000000d6aaa', 'OBP Org A', 'obp-org-a', 'launch', 'active', '00000000-0000-0000-0000-00000000d6a1'),
  ('00000000-0000-0000-0000-0000000d6bbb', 'OBP Org B', 'obp-org-b', 'launch', 'active', '00000000-0000-0000-0000-00000000d6b1')
on conflict do nothing;
insert into public.organization_memberships (organization_id, profile_id, role) values
  ('00000000-0000-0000-0000-0000000d6aaa', '00000000-0000-0000-0000-00000000d6a1', 'owner'),
  ('00000000-0000-0000-0000-0000000d6bbb', '00000000-0000-0000-0000-00000000d6b1', 'owner')
on conflict do nothing;
insert into public.companies (id, organization_id, name, slug) values
  ('00000000-0000-0000-0000-0000000d6c01', '00000000-0000-0000-0000-0000000d6aaa', 'OBP Brand', 'obp-brand')
on conflict do nothing;

create or replace function pg_temp.save_step(who uuid, org uuid) returns text language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', who::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
  insert into public.onboarding_progress (organization_id, company_id, step, status, updated_at)
  values (org, '00000000-0000-0000-0000-0000000d6c01', 'business', 'complete', now())
  on conflict (organization_id, company_id, step) do update
    set status = excluded.status, updated_at = excluded.updated_at;
  insert into public.onboarding_events (organization_id, company_id, step, event)
  values (org, '00000000-0000-0000-0000-0000000d6c01', 'business', 'complete');
  execute 'reset role';
  return 'ok';
exception when insufficient_privilege then
  execute 'reset role';
  return 'refused';
end $$;

set client_min_messages = notice;

-- Production's state: RLS on, no policies.
drop policy if exists "onboarding_progress_members_select" on public.onboarding_progress;
drop policy if exists "onboarding_progress_members_insert" on public.onboarding_progress;
drop policy if exists "onboarding_progress_members_update" on public.onboarding_progress;
drop policy if exists "onboarding_events_members_select" on public.onboarding_events;
drop policy if exists "onboarding_events_members_insert" on public.onboarding_events;
do $$ begin
  if pg_temp.save_step('00000000-0000-0000-0000-00000000d6a1', '00000000-0000-0000-0000-0000000d6aaa') <> 'refused' then
    raise exception 'FAIL setup: with no policies the wizard write should be refused (production state)';
  end if;
  raise notice 'ok   production state reproduced: no policies → refused';
end $$;

set client_min_messages = warning;
\i supabase/migrations/20261103110000_onboarding_policies.sql
set client_min_messages = notice;

do $$
declare n int;
begin
  if pg_temp.save_step('00000000-0000-0000-0000-00000000d6a1', '00000000-0000-0000-0000-0000000d6aaa') <> 'ok' then
    raise exception 'FAIL member could not save an onboarding step';
  end if;
  if pg_temp.save_step('00000000-0000-0000-0000-00000000d6a1', '00000000-0000-0000-0000-0000000d6aaa') <> 'ok' then
    raise exception 'FAIL member could not re-save an onboarding step (conflict path)';
  end if;
  raise notice 'ok   member saves an onboarding step twice and logs events';
  if pg_temp.save_step('00000000-0000-0000-0000-00000000d6b1', '00000000-0000-0000-0000-0000000d6aaa') <> 'refused' then
    raise exception 'FAIL outsider saved onboarding progress into another org';
  end if;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000d6b1', true);
  set local role authenticated;
  select count(*) into n from public.onboarding_progress where organization_id = '00000000-0000-0000-0000-0000000d6aaa';
  reset role;
  if n <> 0 then raise exception 'FAIL outsider sees % onboarding rows of another org', n; end if;
  raise notice 'ok   outsider refused and sees nothing';
end $$;
