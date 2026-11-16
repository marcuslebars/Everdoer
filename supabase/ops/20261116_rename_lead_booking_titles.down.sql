-- Rollback for 20261116_rename_lead_booking_titles.sql: put the old titles back, drop the backup.
begin;
update public.bookings b set title = o.old_title
from public.ops_backup_lead_booking_titles o where o.kind = 'booking' and o.id = b.id;
update public.invoices i set title = o.old_title
from public.ops_backup_lead_booking_titles o where o.kind = 'invoice' and o.id = i.id;
drop table if exists public.ops_backup_lead_booking_titles;
commit;
