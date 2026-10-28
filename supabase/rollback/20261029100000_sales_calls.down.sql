-- Rollback for 20261029100000_sales_calls.sql. Drops the sales-call queue, the consent records
-- and the internal do-not-call list. Export call_consents and do_not_call first if you need the
-- records (the CRTC expects a do-not-call request to be honoured for 3 years + 14 days).
drop table if exists public.sales_calls;
drop table if exists public.do_not_call;
drop table if exists public.call_consents;
alter table public.companies drop column if exists sales_call_settings;
