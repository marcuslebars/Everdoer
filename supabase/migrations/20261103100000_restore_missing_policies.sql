-- Restore access rules that production is missing (checked 2026-11-03 against pg_policies).
-- Each table below had RLS on and NO policies in production, although its original migration
-- created them, so every write as the signed-in user was refused:
--
--   contact_read_state   (20260906170000_conversation_inbox.sql)  Inbox "mark read" has always
--                        failed: "new row violates row-level security policy", 0 rows written.
--   onboarding_progress  (20260907120000_onboarding.sql)  the self-serve wizard's step saves.
--   onboarding_events    (20260907120000_onboarding.sql)  the wizard's funnel events.
--
-- Same rules as the originals. Idempotent (drop if exists + create), safe to re-run.
-- Rollback: supabase/rollback/20261103100000_restore_missing_policies.down.sql

-- ── contact_read_state: each member reads/writes only their OWN markers ────────

alter table public.contact_read_state enable row level security;

drop policy if exists "contact_read_state_self_select" on public.contact_read_state;
create policy "contact_read_state_self_select"
  on public.contact_read_state for select
  using (public.is_organization_member(organization_id) and profile_id = auth.uid());

drop policy if exists "contact_read_state_self_insert" on public.contact_read_state;
create policy "contact_read_state_self_insert"
  on public.contact_read_state for insert
  with check (public.is_organization_member(organization_id) and profile_id = auth.uid());

drop policy if exists "contact_read_state_self_update" on public.contact_read_state;
create policy "contact_read_state_self_update"
  on public.contact_read_state for update
  using (public.is_organization_member(organization_id) and profile_id = auth.uid())
  with check (public.is_organization_member(organization_id) and profile_id = auth.uid());

-- The app writes as the signed-in user (authenticated); anon gets nothing.
grant select, insert, update on public.contact_read_state to authenticated;
revoke all on public.contact_read_state from anon;

-- ── onboarding_progress / onboarding_events: any member of the org ─────────────
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
