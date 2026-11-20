-- Rollback for 20261120120000_company_site_style.sql. Pages already generated keep their look in
-- company_sites.content.settings; only the pre-generation choice is lost.
alter table public.companies drop column if exists site_style;
