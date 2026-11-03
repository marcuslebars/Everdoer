-- Restore the access rules on the self-serve onboarding tables.
--
-- 20260907120000_onboarding.sql creates onboarding_progress and onboarding_events with RLS on and
-- member policies, but production has RLS on and NO policies on both (checked 2026-11-03 against
-- pg_policies). The wizard writes both as the signed-in user, so its step saves are refused (and
-- its funnel events silently dropped). Same as 20261103100000 did for contact_read_state.
--
-- Same rules as the original: any member of the organization. Idempotent, safe to re-run.
-- Rollback: supabase/rollback/20261103110000_onboarding_policies.down.sql

alter table public.onboarding_progress enable row level security;

drop policy if exists "onboarding_progress_members_select" on public.onboarding_progress;
create policy "onboarding_progress_members_select"
  on public.onboarding_progress for select
  using (public.is_organization_member(organization_id));

drop policy if exists "onboarding_progress_members_insert" on public.onboarding_progress;
create policy "onboarding_progress_members_insert"
  on public.onboarding_progress for insert
  with check (public.is_organization_member(organization_id));

drop policy if exists "onboarding_progress_members_update" on public.onboarding_progress;
create policy "onboarding_progress_members_update"
  on public.onboarding_progress for update
  using (public.is_organization_member(organization_id))
  with check (public.is_organization_member(organization_id));

alter table public.onboarding_events enable row level security;

drop policy if exists "onboarding_events_members_select" on public.onboarding_events;
create policy "onboarding_events_members_select"
  on public.onboarding_events for select
  using (public.is_organization_member(organization_id));

drop policy if exists "onboarding_events_members_insert" on public.onboarding_events;
create policy "onboarding_events_members_insert"
  on public.onboarding_events for insert
  with check (public.is_organization_member(organization_id));
