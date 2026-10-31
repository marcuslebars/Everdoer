-- 20261101100000_site_branding_domains.sql: the tab icon and custom-domain columns on
-- company_sites (https-only icon, valid lower-case domain, one business per domain, status values)
-- and the public site-images bucket.
\set ON_ERROR_STOP on
set client_min_messages = notice;
reset role;

insert into public.organizations (id, name, slug) values ('5b200000-0000-4000-8000-000000000001', 'Site Brands', 'site-brands') on conflict do nothing;
insert into public.companies (id, organization_id, name, slug) values
  ('5b300000-0000-4000-8000-000000000001', '5b200000-0000-4000-8000-000000000001', 'Brand One', 'site-brand-one'),
  ('5b300000-0000-4000-8000-000000000002', '5b200000-0000-4000-8000-000000000001', 'Brand Two', 'site-brand-two')
on conflict do nothing;
insert into public.company_sites (organization_id, company_id, slug) values
  ('5b200000-0000-4000-8000-000000000001', '5b300000-0000-4000-8000-000000000001', 'site-brand-one'),
  ('5b200000-0000-4000-8000-000000000001', '5b300000-0000-4000-8000-000000000002', 'site-brand-two')
on conflict do nothing;

do $$
begin
  raise notice '== company_sites: tab icon and custom domain';
  update public.company_sites set favicon_url = 'https://cdn.example/icon.png', custom_domain = 'www.brand-one.ca', custom_domain_status = 'pending'
    where company_id = '5b300000-0000-4000-8000-000000000001';

  begin
    update public.company_sites set favicon_url = 'http://insecure/icon.png' where company_id = '5b300000-0000-4000-8000-000000000001';
    raise exception 'FAIL a non-https tab icon was accepted';
  exception when check_violation then null;
  end;

  begin
    update public.company_sites set custom_domain = 'WWW.Brand-Two.ca' where company_id = '5b300000-0000-4000-8000-000000000002';
    raise exception 'FAIL an upper-case domain was accepted';
  exception when check_violation then null;
  end;

  begin
    update public.company_sites set custom_domain = 'https://brand-two.ca/' where company_id = '5b300000-0000-4000-8000-000000000002';
    raise exception 'FAIL a URL was accepted as a domain';
  exception when check_violation then null;
  end;

  begin
    update public.company_sites set custom_domain = 'www.brand-one.ca' where company_id = '5b300000-0000-4000-8000-000000000002';
    raise exception 'FAIL two businesses got the same domain';
  exception when unique_violation then null;
  end;

  begin
    update public.company_sites set custom_domain_status = 'verified' where company_id = '5b300000-0000-4000-8000-000000000001';
    raise exception 'FAIL an unknown domain status was accepted';
  exception when check_violation then null;
  end;

  if (select custom_domain_status from public.company_sites where company_id = '5b300000-0000-4000-8000-000000000002') <> 'none' then
    raise exception 'FAIL custom_domain_status should default to none';
  end if;

  if not exists (select 1 from storage.buckets where id = 'site-images' and public) then
    raise exception 'FAIL the public site-images bucket is missing';
  end if;
  raise notice 'ok   https icon, valid lower-case domain, one business per domain, known statuses, public bucket';
end $$;
