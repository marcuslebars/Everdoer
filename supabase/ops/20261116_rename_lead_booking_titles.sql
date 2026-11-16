-- One-off data fix (16 Nov 2026): jobs and invoices created from booking forms before the
-- readable-title fix are titled "Lead booking — <source slug>" (e.g. "Lead booking —
-- a1marinecare-booking"), and customers saw it on invoices. Rename them to
-- "Booking — <customer name>" (or "Online booking" with no name). New ones are already titled by
-- service + customer (leadBookingTitle, PR #233).
--
-- Counted read-only before writing this: 25 bookings, 2 invoices.
-- Keeps the old titles in ops_backup_lead_booking_titles so the .down.sql can put them back.
begin;

create table if not exists public.ops_backup_lead_booking_titles (
  kind text not null check (kind in ('booking', 'invoice')),
  id uuid not null,
  old_title text not null,
  primary key (kind, id)
);

insert into public.ops_backup_lead_booking_titles (kind, id, old_title)
select 'booking', b.id, b.title from public.bookings b where b.title like 'Lead booking — %'
on conflict do nothing;

insert into public.ops_backup_lead_booking_titles (kind, id, old_title)
select 'invoice', i.id, i.title from public.invoices i where i.title like 'Lead booking — %'
on conflict do nothing;

update public.bookings b
set title = coalesce(
  'Booking — ' || nullif(trim(concat_ws(' ', c.first_name, c.last_name)), ''),
  'Online booking'
)
from public.bookings b2
left join public.contacts c on c.id = b2.contact_id
where b.id = b2.id and b.title like 'Lead booking — %';

update public.invoices i
set title = coalesce(
  'Booking — ' || nullif(trim(concat_ws(' ', c.first_name, c.last_name)), ''),
  'Online booking'
)
from public.invoices i2
left join public.contacts c on c.id = i2.contact_id
where i.id = i2.id and i.title like 'Lead booking — %';

-- Expect 0 and 0.
select
  (select count(*) from public.bookings where title like 'Lead booking — %') as bookings_left,
  (select count(*) from public.invoices where title like 'Lead booking — %') as invoices_left;

commit;
