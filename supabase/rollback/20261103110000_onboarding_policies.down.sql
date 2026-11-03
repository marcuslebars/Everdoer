-- Rollback for 20261103110000_onboarding_policies.sql: back to RLS on with no policies on the two
-- onboarding tables (client writes refused, as before). Tables and rows are kept.
drop policy if exists "onboarding_progress_members_select" on public.onboarding_progress;
drop policy if exists "onboarding_progress_members_insert" on public.onboarding_progress;
drop policy if exists "onboarding_progress_members_update" on public.onboarding_progress;
drop policy if exists "onboarding_events_members_select" on public.onboarding_events;
drop policy if exists "onboarding_events_members_insert" on public.onboarding_events;
