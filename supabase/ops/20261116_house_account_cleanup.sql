-- One-off (16 Nov 2026, run by Claude at Marcus's request): tidy the A1 Group house account.
--   1. 81 leads → closed: stage lead, untouched 30+ days, no invoice, no approved/completed/
--      deposit-paid or open (sent/viewed) quote, no booking in the last 30 days or upcoming.
--   2. 7 leads that already have an invoice → active.
--   3. 20 overdue automatic follow-up tasks (created_by null) → completed.
-- Plain SQL: no workflow events fire (contact.stage_changed is emitted by the app, not a trigger),
-- so no customer was messaged. Old values in decommission.ops_backup_house_cleanup_20261116;
-- 20261116_house_account_cleanup.down.sql restores them. This file records what ran.
begin;
create table if not exists decommission.ops_backup_house_cleanup_20261116 (
  kind text not null check (kind in ('contact_stage', 'task_status')),
  id uuid not null,
  old_value text not null,
  primary key (kind, id)
);
with o as (select 'a1000000-0000-4000-8000-000000000001'::uuid id),
stale as (
  select c.id, c.stage::text old from public.contacts c, o
  where c.organization_id = o.id and c.stage = 'lead' and c.updated_at < now() - interval '30 days'
    and not exists (select 1 from public.invoices i where i.contact_id = c.id)
    and not exists (select 1 from public.quotes q where q.contact_id = c.id and q.status::text in ('approved', 'completed', 'deposit_paid', 'sent', 'viewed'))
    and not exists (select 1 from public.bookings b where b.contact_id = c.id and b.scheduled_for > now() - interval '30 days')
), saved as (
  insert into decommission.ops_backup_house_cleanup_20261116 (kind, id, old_value)
  select 'contact_stage', id, old from stale on conflict do nothing returning id
)
update public.contacts c set stage = 'closed' from saved where c.id = saved.id;
with o as (select 'a1000000-0000-4000-8000-000000000001'::uuid id),
billed as (
  select c.id, c.stage::text old from public.contacts c, o
  where c.organization_id = o.id and c.stage = 'lead' and exists (select 1 from public.invoices i where i.contact_id = c.id)
), saved as (
  insert into decommission.ops_backup_house_cleanup_20261116 (kind, id, old_value)
  select 'contact_stage', id, old from billed on conflict do nothing returning id
)
update public.contacts c set stage = 'active' from saved where c.id = saved.id;
with o as (select 'a1000000-0000-4000-8000-000000000001'::uuid id),
overdue as (
  select t.id, t.status::text old from public.tasks t, o
  where t.organization_id = o.id and t.status::text <> 'completed' and t.due_at < now() and t.created_by is null
), saved as (
  insert into decommission.ops_backup_house_cleanup_20261116 (kind, id, old_value)
  select 'task_status', id, old from overdue on conflict do nothing returning id
)
update public.tasks t set status = 'completed' from saved where t.id = saved.id;
commit;
