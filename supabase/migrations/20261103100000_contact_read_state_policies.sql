-- Restore the access rules on contact_read_state (per-user "last read" markers for the Inbox).
--
-- 20260906170000_conversation_inbox.sql created the table with RLS on and three policies, but
-- production ended up with RLS on and NO policies (checked 2026-11-03: pg_policies empty, 0 rows
-- ever written). With no policy every write is refused, so marking a conversation read has
-- failed with "new row violates row-level security policy" since the Inbox shipped.
--
-- Same rules as the original: each member reads and writes only their OWN markers, in an org
-- they belong to. Idempotent (drop if exists + create), safe to re-run.
-- Rollback: supabase/rollback/20261103100000_contact_read_state_policies.down.sql

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
