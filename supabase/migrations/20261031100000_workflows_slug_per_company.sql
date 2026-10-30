-- Automations are per business, not per organization (docs/workflows.md).
--
-- workflows had unique (organization_id, slug), but every automation is installed and looked up
-- per COMPANY (recipes/install.ts existingRecipeWorkflows, packs/apply.ts, the done-for-you
-- checklist, the Estimator). In an organization with more than one business, the second business's
-- starter automations ("missed-call-text-back", "quote-follow-up", …) hit that constraint, and the
-- install failed silently, so only the first business ever got them.
--
-- Now: a slug is unique per business, and org-wide automations (company_id null) keep their own
-- unique slug, as before.
--
-- Backfill the businesses that missed out: npm run job:install-missing-recipes (dry run first).
-- Rollback: supabase/rollback/20261031100000_workflows_slug_per_company.down.sql

alter table public.workflows drop constraint if exists workflows_organization_id_slug_key;

create unique index if not exists workflows_company_slug_key
  on public.workflows (organization_id, company_id, slug)
  where company_id is not null;

create unique index if not exists workflows_org_slug_key
  on public.workflows (organization_id, slug)
  where company_id is null;
