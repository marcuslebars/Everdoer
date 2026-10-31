-- Rollback of 20261101100000_site_branding_domains.sql. Remove any connected domains in Railway
-- first (Settings → Your website → Remove), or they keep pointing at the app.
-- The bucket and its files are left in place (storage.objects rows can't be dropped from SQL
-- safely); delete them from the Supabase dashboard if needed.
drop index if exists public.company_sites_custom_domain_key;
alter table public.company_sites
  drop column if exists custom_domain_added_at,
  drop column if exists custom_domain_checked_at,
  drop column if exists custom_domain_dns,
  drop column if exists custom_domain_status,
  drop column if exists custom_domain_ref,
  drop column if exists custom_domain,
  drop column if exists favicon_url;
