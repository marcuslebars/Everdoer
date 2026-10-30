-- Rollback for 20261031100000_workflows_slug_per_company.sql. Restores the organization-wide
-- unique slug. FAILS if two businesses in one organization now have an automation with the same
-- slug (which is the point of the migration); delete or rename those first:
--   select organization_id, slug, count(*) from public.workflows group by 1, 2 having count(*) > 1;
drop index if exists public.workflows_company_slug_key;
drop index if exists public.workflows_org_slug_key;
alter table public.workflows add constraint workflows_organization_id_slug_key unique (organization_id, slug);
