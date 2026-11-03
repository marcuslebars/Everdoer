-- Rollback for 20261103100000_restore_missing_policies.sql: back to RLS on with no policies on
-- these three tables (client writes refused, as before). Tables and rows are kept.
drop policy if exists "contact_read_state_self_select" on public.contact_read_state;
drop policy if exists "contact_read_state_self_insert" on public.contact_read_state;
drop policy if exists "contact_read_state_self_update" on public.contact_read_state;
drop policy if exists "onboarding_progress_members_select" on public.onboarding_progress;
drop policy if exists "onboarding_progress_members_insert" on public.onboarding_progress;
drop policy if exists "onboarding_progress_members_update" on public.onboarding_progress;
drop policy if exists "onboarding_events_members_select" on public.onboarding_events;
drop policy if exists "onboarding_events_members_insert" on public.onboarding_events;
