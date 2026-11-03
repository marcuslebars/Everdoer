-- Rollback for 20261103100000_contact_read_state_policies.sql: back to RLS on with no policies
-- (every read-marker write refused, as before). The table and its rows are kept.
drop policy if exists "contact_read_state_self_select" on public.contact_read_state;
drop policy if exists "contact_read_state_self_insert" on public.contact_read_state;
drop policy if exists "contact_read_state_self_update" on public.contact_read_state;
