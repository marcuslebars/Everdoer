-- Rollback for 20261116100000_invoice_terms_default_7_days.sql.
alter table public.companies alter column invoice_settings set default '{}'::jsonb;
