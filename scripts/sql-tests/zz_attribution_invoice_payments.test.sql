-- Revenue attribution with invoice payments: 20261027110000_attribution_invoice_payments.sql.
--   • a quote's paid_cents = its paid deposit + succeeded payments on its live invoice (the
--     invoice's credit_cents — the carried-over deposit — isn't counted twice); refunded /
--     failed / pending payments and void invoices don't count;
--   • a quote with invoice money but no approval / deposit joins the report;
--   • an invoice with no quote and a succeeded payment is its own row (deal_kind 'invoice');
--     an unpaid standalone invoice isn't;
--   • ui_attribution_summary sums the new paid_cents; a member reads only their org;
--   • the rollback restores the deposits-only view and the migration re-applies.
\set ON_ERROR_STOP on
set client_min_messages = notice;
reset role;

insert into auth.users (id, email) values ('0e100000-0000-4000-8000-000000000001', 'owner@attr.test') on conflict do nothing;
insert into public.profiles (id, email, full_name) values ('0e100000-0000-4000-8000-000000000001', 'owner@attr.test', 'Attr Owner') on conflict do nothing;
insert into public.organizations (id, name, slug) values
  ('0e200000-0000-4000-8000-000000000001', 'Attr Test', 'attr-test'),
  ('0e200000-0000-4000-8000-000000000002', 'Attr Other', 'attr-other')
on conflict do nothing;
insert into public.organization_memberships (organization_id, profile_id, role) values
  ('0e200000-0000-4000-8000-000000000001', '0e100000-0000-4000-8000-000000000001', 'member')
on conflict do nothing;
update public.organization_memberships set role = 'member' where organization_id = '0e200000-0000-4000-8000-000000000001' and profile_id = '0e100000-0000-4000-8000-000000000001';
insert into public.companies (id, organization_id, name, slug) values
  ('0e300000-0000-4000-8000-000000000001', '0e200000-0000-4000-8000-000000000001', 'Northshore', 'northshore-attr'),
  ('0e300000-0000-4000-8000-000000000002', '0e200000-0000-4000-8000-000000000002', 'Elsewhere', 'elsewhere-attr')
on conflict do nothing;
insert into public.contacts (id, organization_id, company_id, first_name, phone) values
  ('0e400000-0000-4000-8000-000000000001', '0e200000-0000-4000-8000-000000000001', '0e300000-0000-4000-8000-000000000001', 'Dana', '+17055550111'),
  ('0e400000-0000-4000-8000-000000000002', '0e200000-0000-4000-8000-000000000001', '0e300000-0000-4000-8000-000000000001', 'Sam', '+17055550112'),
  ('0e400000-0000-4000-8000-000000000003', '0e200000-0000-4000-8000-000000000002', '0e300000-0000-4000-8000-000000000002', 'Other', '+14165550113')
on conflict do nothing;

-- Q1: approved $10,000, $1,000 deposit paid, invoice paid $5,000 + $4,000 (one refunded $500 payment, one failed $700).
-- Q2: never approved online, no deposit — but its invoice got $2,500.
-- Q3: approved, deposit paid $300; its first invoice was VOIDED after a $999 payment.
-- Q4: approved $800, nothing paid.
insert into public.quotes (id, organization_id, company_id, contact_id, public_token, status, approved_total_cents, approved_at, deposit_cents, approved_deposit_cents, deposit_paid_at) values
  ('0e500000-0000-4000-8000-000000000001', '0e200000-0000-4000-8000-000000000001', '0e300000-0000-4000-8000-000000000001', '0e400000-0000-4000-8000-000000000001', 'attr-q1', 'deposit_paid', 1000000, '2026-10-02T14:00:00Z', 100000, 100000, '2026-10-02T15:00:00Z'),
  ('0e500000-0000-4000-8000-000000000002', '0e200000-0000-4000-8000-000000000001', '0e300000-0000-4000-8000-000000000001', '0e400000-0000-4000-8000-000000000002', 'attr-q2', 'sent', null, null, 0, null, null),
  ('0e500000-0000-4000-8000-000000000003', '0e200000-0000-4000-8000-000000000001', '0e300000-0000-4000-8000-000000000001', '0e400000-0000-4000-8000-000000000001', 'attr-q3', 'deposit_paid', 300000, '2026-10-03T14:00:00Z', 30000, 30000, '2026-10-03T15:00:00Z'),
  ('0e500000-0000-4000-8000-000000000004', '0e200000-0000-4000-8000-000000000001', '0e300000-0000-4000-8000-000000000001', '0e400000-0000-4000-8000-000000000002', 'attr-q4', 'approved', 80000, '2026-10-04T14:00:00Z', 0, null, null),
  ('0e500000-0000-4000-8000-000000000009', '0e200000-0000-4000-8000-000000000002', '0e300000-0000-4000-8000-000000000002', '0e400000-0000-4000-8000-000000000003', 'attr-q9', 'approved', 50000, '2026-10-04T14:00:00Z', 0, null, null)
on conflict do nothing;

insert into public.invoices (id, organization_id, company_id, contact_id, quote_id, public_token, status, total_cents, credit_cents) values
  ('0e600000-0000-4000-8000-000000000001', '0e200000-0000-4000-8000-000000000001', '0e300000-0000-4000-8000-000000000001', '0e400000-0000-4000-8000-000000000001', '0e500000-0000-4000-8000-000000000001', 'attr-i1', 'paid', 1000000, 100000),
  ('0e600000-0000-4000-8000-000000000002', '0e200000-0000-4000-8000-000000000001', '0e300000-0000-4000-8000-000000000001', '0e400000-0000-4000-8000-000000000002', '0e500000-0000-4000-8000-000000000002', 'attr-i2', 'partially_paid', 500000, 0),
  ('0e600000-0000-4000-8000-000000000003', '0e200000-0000-4000-8000-000000000001', '0e300000-0000-4000-8000-000000000001', '0e400000-0000-4000-8000-000000000001', '0e500000-0000-4000-8000-000000000003', 'attr-i3', 'void', 300000, 30000),
  -- Standalone (no quote): one paid $450, one unpaid.
  ('0e600000-0000-4000-8000-000000000004', '0e200000-0000-4000-8000-000000000001', '0e300000-0000-4000-8000-000000000001', '0e400000-0000-4000-8000-000000000002', null, 'attr-i4', 'paid', 45000, 0),
  ('0e600000-0000-4000-8000-000000000005', '0e200000-0000-4000-8000-000000000001', '0e300000-0000-4000-8000-000000000001', '0e400000-0000-4000-8000-000000000002', null, 'attr-i5', 'sent', 99000, 0),
  ('0e600000-0000-4000-8000-000000000009', '0e200000-0000-4000-8000-000000000002', '0e300000-0000-4000-8000-000000000002', '0e400000-0000-4000-8000-000000000003', null, 'attr-i9', 'paid', 12300, 0)
on conflict do nothing;

insert into public.invoice_payments (organization_id, company_id, invoice_id, amount_cents, method, status, received_at) values
  ('0e200000-0000-4000-8000-000000000001', '0e300000-0000-4000-8000-000000000001', '0e600000-0000-4000-8000-000000000001', 500000, 'card', 'succeeded', '2026-10-10T15:00:00Z'),
  ('0e200000-0000-4000-8000-000000000001', '0e300000-0000-4000-8000-000000000001', '0e600000-0000-4000-8000-000000000001', 400000, 'etransfer', 'succeeded', '2026-10-12T15:00:00Z'),
  ('0e200000-0000-4000-8000-000000000001', '0e300000-0000-4000-8000-000000000001', '0e600000-0000-4000-8000-000000000001', 50000, 'card', 'refunded', '2026-10-11T15:00:00Z'),
  ('0e200000-0000-4000-8000-000000000001', '0e300000-0000-4000-8000-000000000001', '0e600000-0000-4000-8000-000000000001', 70000, 'card', 'failed', '2026-10-11T16:00:00Z'),
  ('0e200000-0000-4000-8000-000000000001', '0e300000-0000-4000-8000-000000000001', '0e600000-0000-4000-8000-000000000002', 250000, 'cheque', 'succeeded', '2026-10-15T15:00:00Z'),
  ('0e200000-0000-4000-8000-000000000001', '0e300000-0000-4000-8000-000000000001', '0e600000-0000-4000-8000-000000000003', 99900, 'card', 'succeeded', '2026-10-05T15:00:00Z'),
  ('0e200000-0000-4000-8000-000000000001', '0e300000-0000-4000-8000-000000000001', '0e600000-0000-4000-8000-000000000004', 45000, 'card', 'succeeded', '2026-10-20T15:00:00Z'),
  ('0e200000-0000-4000-8000-000000000002', '0e300000-0000-4000-8000-000000000002', '0e600000-0000-4000-8000-000000000009', 12300, 'card', 'succeeded', '2026-10-20T15:00:00Z');

do $$
declare
  r record;
  n int;
begin
  raise notice '== revenue_attribution_v counts invoice payments';
  select * into r from public.revenue_attribution_v where quote_id = '0e500000-0000-4000-8000-000000000001';
  if r.paid_cents <> 1000000 or r.deposit_cents <> 100000 or r.invoice_paid_cents <> 900000 or r.deal_kind <> 'quote' then
    raise exception 'FAIL Q1 paid % (deposit % + invoices %), expected 1000000 = 100000 + 900000', r.paid_cents, r.deposit_cents, r.invoice_paid_cents;
  end if;
  if r.paid_at <> '2026-10-02T15:00:00Z'::timestamptz then raise exception 'FAIL Q1 paid_at %', r.paid_at; end if;
  raise notice 'ok   deposit + succeeded invoice payments; refunded / failed ignored; credit not double-counted';

  select * into r from public.revenue_attribution_v where quote_id = '0e500000-0000-4000-8000-000000000002';
  if r is null or r.paid_cents <> 250000 or r.approved_at is not null or r.paid_at <> '2026-10-15T15:00:00Z'::timestamptz then
    raise exception 'FAIL Q2 (invoice money, never approved) missing or wrong: %', r;
  end if;
  raise notice 'ok   a quote paid only through its invoice joins the report (paid_at = first payment)';

  select * into r from public.revenue_attribution_v where quote_id = '0e500000-0000-4000-8000-000000000003';
  if r.paid_cents <> 30000 or r.invoice_paid_cents <> 0 then raise exception 'FAIL Q3 counted a void invoice: %', r.paid_cents; end if;
  select * into r from public.revenue_attribution_v where quote_id = '0e500000-0000-4000-8000-000000000004';
  if r.paid_cents <> 0 or r.approved_cents <> 80000 then raise exception 'FAIL Q4 %', r; end if;
  raise notice 'ok   a void invoice counts nothing; an approved unpaid quote stays at 0';

  select * into r from public.revenue_attribution_v where invoice_id = '0e600000-0000-4000-8000-000000000004';
  if r is null or r.deal_kind <> 'invoice' or r.quote_id is not null or r.paid_cents <> 45000 or r.approved_cents <> 45000
     or r.contact_id <> '0e400000-0000-4000-8000-000000000002' or r.paid_at <> '2026-10-20T15:00:00Z'::timestamptz then
    raise exception 'FAIL standalone paid invoice row: %', r;
  end if;
  if exists (select 1 from public.revenue_attribution_v where invoice_id = '0e600000-0000-4000-8000-000000000005') then
    raise exception 'FAIL an unpaid standalone invoice is in the report';
  end if;
  if exists (select 1 from public.revenue_attribution_v where invoice_id in ('0e600000-0000-4000-8000-000000000001', '0e600000-0000-4000-8000-000000000002')) then
    raise exception 'FAIL a quote''s invoice also got its own row (double count)';
  end if;
  raise notice 'ok   a paid invoice without a quote is its own row; unpaid ones and quote invoices are not';

  select count(*) into n from public.revenue_attribution_v where organization_id = '0e200000-0000-4000-8000-000000000001';
  if n <> 5 then raise exception 'FAIL expected 5 deals for the org, got %', n; end if;
end $$;

-- ── The summary RPC + RLS, as the member ────────────────────────────────────────────
set role authenticated;
select set_config('request.jwt.claim.sub', '0e100000-0000-4000-8000-000000000001', false);
do $$
declare s record;
begin
  select * into s from public.ui_attribution_summary('0e200000-0000-4000-8000-000000000001', null, '2026-10-01T04:00:00Z', '2026-11-01T04:00:00Z');
  -- 1,000,000 + 250,000 + 30,000 + 0 + 45,000
  if s.paid_cents_total <> 1325000 then raise exception 'FAIL summary paid % (expected 1325000)', s.paid_cents_total; end if;
  if s.quotes_count <> 5 then raise exception 'FAIL summary count %', s.quotes_count; end if;
  if exists (select 1 from public.revenue_attribution_v where organization_id = '0e200000-0000-4000-8000-000000000002') then
    raise exception 'FAIL member reads another org''s attribution';
  end if;
  raise notice 'ok   ui_attribution_summary sums deposits + invoice payments; a member sees only their org';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);

-- ── Rollback restores deposits-only; re-apply ───────────────────────────────────────
\i supabase/rollback/20261027110000_attribution_invoice_payments.down.sql
do $$
declare r record;
begin
  select * into r from public.revenue_attribution_v where quote_id = '0e500000-0000-4000-8000-000000000001';
  if r.paid_cents <> 100000 then raise exception 'FAIL rollback: Q1 paid % (expected the deposit only)', r.paid_cents; end if;
  if exists (select 1 from public.revenue_attribution_v where quote_id = '0e500000-0000-4000-8000-000000000002') then
    raise exception 'FAIL rollback: Q2 still listed';
  end if;
  raise notice 'ok   rollback restores the deposits-only view';
end $$;
\i supabase/migrations/20261027110000_attribution_invoice_payments.sql
\i supabase/migrations/20261027110000_attribution_invoice_payments.sql
do $$
begin
  if (select paid_cents from public.revenue_attribution_v where quote_id = '0e500000-0000-4000-8000-000000000001') <> 1000000 then
    raise exception 'FAIL re-apply';
  end if;
  raise notice 'ok   down → up → up';
end $$;
