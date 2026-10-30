-- 20261031100000_workflows_slug_per_company.sql: two businesses in one organization can each have
-- the same automation; one business can't have it twice; org-wide automations stay unique.
\set ON_ERROR_STOP on
set client_min_messages = notice;
reset role;

insert into public.organizations (id, name, slug) values ('0d200000-0000-4000-8000-000000000001', 'Multi Brand', 'multi-brand') on conflict do nothing;
insert into public.companies (id, organization_id, name, slug) values
  ('0d300000-0000-4000-8000-000000000001', '0d200000-0000-4000-8000-000000000001', 'Brand One', 'brand-one'),
  ('0d300000-0000-4000-8000-000000000002', '0d200000-0000-4000-8000-000000000001', 'Brand Two', 'brand-two'),
  ('0d300000-0000-4000-8000-000000000003', '0d200000-0000-4000-8000-000000000001', 'Brand Three', 'brand-three')
on conflict do nothing;

do $$
begin
  raise notice '== workflow slugs per business';
  insert into public.workflows (organization_id, company_id, name, slug, trigger_event) values
    ('0d200000-0000-4000-8000-000000000001', '0d300000-0000-4000-8000-000000000001', 'Missed call text-back', 'missed-call-text-back', 'call.missed'),
    ('0d200000-0000-4000-8000-000000000001', '0d300000-0000-4000-8000-000000000002', 'Missed call text-back', 'missed-call-text-back', 'call.missed'),
    ('0d200000-0000-4000-8000-000000000001', '0d300000-0000-4000-8000-000000000003', 'Missed call text-back', 'missed-call-text-back', 'call.missed');
  begin
    insert into public.workflows (organization_id, company_id, name, slug, trigger_event) values
      ('0d200000-0000-4000-8000-000000000001', '0d300000-0000-4000-8000-000000000001', 'Again', 'missed-call-text-back', 'call.missed');
    raise exception 'FAIL one business got the same automation twice';
  exception when unique_violation then null;
  end;
  insert into public.workflows (organization_id, company_id, name, slug, trigger_event) values
    ('0d200000-0000-4000-8000-000000000001', null, 'Org-wide', 'org-wide-alert', 'contact.created');
  begin
    insert into public.workflows (organization_id, company_id, name, slug, trigger_event) values
      ('0d200000-0000-4000-8000-000000000001', null, 'Org-wide again', 'org-wide-alert', 'contact.created');
    raise exception 'FAIL an org-wide automation slug was duplicated';
  exception when unique_violation then null;
  end;
  raise notice 'ok   same slug across businesses, unique within one business, org-wide slugs still unique';
end $$;
