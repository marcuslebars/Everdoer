-- Your website: logo, photos, browser-tab icon and the business's own domain
-- (docs/done-for-you.md → "Generated sites" → "Images and your own domain").
--
-- Logo → companies.brand_logo_url (already there; also used on quotes and invoices).
-- Photos → companies.profile.photos (already there; the site's first photo is the hero).
-- New here: the tab icon and the custom domain on company_sites, and a public bucket for the
-- images. company_sites stays server-written only (insert/update/delete revoked from clients).

alter table public.company_sites
  add column if not exists favicon_url text check (favicon_url is null or favicon_url ~ '^https://'),
  add column if not exists custom_domain text check (
    custom_domain is null
    or (length(custom_domain) <= 253 and custom_domain ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+([a-z]{2,63}|xn--[a-z0-9-]{2,59})$')
  ),
  -- Railway's id for the domain (customDomainCreate), so it can be checked and removed.
  add column if not exists custom_domain_ref text,
  add column if not exists custom_domain_status text not null default 'none'
    check (custom_domain_status in ('none', 'pending', 'active')),
  -- The DNS records the owner has to add, and their last known state.
  add column if not exists custom_domain_dns jsonb,
  add column if not exists custom_domain_checked_at timestamptz,
  -- When it was connected: a domain still waiting on DNS after a week is released.
  add column if not exists custom_domain_added_at timestamptz;

-- One business per domain.
create unique index if not exists company_sites_custom_domain_key
  on public.company_sites (custom_domain)
  where custom_domain is not null;

-- ── Storage: public `site-images` bucket ──────────────────────────────────────
-- Path: {organization_id}/{company_id}/{logo|photo|favicon}-{uuid}.{png|jpg}. A public bucket, so
-- each file's public URL works for anyone (the website, quotes and invoices show them
-- unauthenticated). Deliberately NO select policy on storage.objects: that would let anyone with
-- the anon key list the bucket (and every org/company id). No client write policy either: uploads
-- go through short-lived signed upload URLs minted by the server after the owner/admin check.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-images', 'site-images', true, 5242880, array['image/png', 'image/jpeg'])
on conflict (id) do nothing;
