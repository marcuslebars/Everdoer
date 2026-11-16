-- New businesses' invoices are due in 7 days instead of on receipt (16 Nov 2026).
-- With "due on receipt" (the code default for an empty invoice_settings), a sent invoice showed
-- as overdue the next day and Home flagged it. Only the column default changes: existing
-- companies keep their stored settings ('{}' still means due on receipt), so nobody's reminder
-- timing moves. Owners change it any time in Settings → Invoices.
alter table public.companies alter column invoice_settings set default '{"paymentTermsDays": 7}'::jsonb;
