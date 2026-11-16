-- Rollback for 20261116200000_contact_stage_follows_work.sql: remove the triggers and functions.
-- The backfilled stages are left as they are (they reflect real invoices/quotes/bookings).
drop trigger if exists contact_stage_from_quote on public.quotes;
drop trigger if exists contact_stage_from_invoice on public.invoices;
drop trigger if exists contact_stage_from_booking on public.bookings;
drop function if exists public.trg_contact_stage_from_quote();
drop function if exists public.trg_contact_stage_from_invoice();
drop function if exists public.trg_contact_stage_from_booking();
drop function if exists public.contact_stage_advance(uuid, text);
