-- Generated-site looks (docs/done-for-you.md → "Generated sites" → "Looks").
-- The look and colour an owner picked BEFORE their page exists: in the quick setup, or in
-- Settings → Your website. Generation copies it into company_sites.content.settings; after that
-- the owner's changes are written to both. Shape: {"theme": "auto"|"bold"|"clean"|"classic",
-- "color": "#rrggbb"|null}; read defensively (parseSiteStyle), so '{}' means "pick for me".
-- Written by the server (service role) behind the owner/admin check and the public setup token;
-- covered by the existing companies RLS for reads.
alter table public.companies
  add column if not exists site_style jsonb not null default '{}'::jsonb;

comment on column public.companies.site_style is
  'Generated-site look chosen before the page exists: {theme, color}. See docs/done-for-you.md (Looks).';
