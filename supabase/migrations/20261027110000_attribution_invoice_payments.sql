-- Revenue attribution counts invoice payments (docs/attribution.md → "paid_cents").
--
-- "Captured by Everdoer" counted only quote DEPOSITS (quotes.deposit_paid_at), so a job that was
-- quoted, done and paid through its invoice showed $0 collected beyond the deposit, and a job
-- invoiced without a quote (online booking deposits, booked jobs) never showed at all. Now:
--
--   • a quote row's paid_cents = its paid deposit + every SUCCEEDED invoice_payments row on its
--     live (not void) invoice(s). The invoice's credit_cents (the deposit carried over) is not a
--     payment row, so the deposit is never counted twice. Refunded / failed / pending: not counted.
--   • a quote also joins the report once money arrives on its invoice, even if it was never
--     approved online or its deposit wasn't paid through Stripe.
--   • an invoice with NO quote and at least one succeeded payment is its own row (quote_id null,
--     invoice_id set, deal_kind 'invoice'): approved_cents = its total, paid_cents = its payments,
--     paid_at = its first payment, attributed through the invoice's contact.
--   • paid_at = the first money in (the deposit, else the first invoice payment). "Close" is still
--     coalesce(approved_at, paid_at); a deal is reported in the period containing it, with
--     everything collected on it to date.
--
-- Same columns in the same order (so ui_attribution_summary and every reader keep working), plus
-- four at the end: invoice_id, deal_kind ('quote' | 'invoice'), deposit_cents, invoice_paid_cents.
-- security_invoker as before (members read invoices and invoice_payments under RLS).
-- Rollback: supabase/rollback/20261027110000_attribution_invoice_payments.down.sql

create index if not exists invoice_payments_succeeded_invoice_idx
  on public.invoice_payments (invoice_id) where status = 'succeeded';

create or replace view public.revenue_attribution_v
with (security_invoker = true)
as
  with invoice_paid as (
    select
      i.organization_id,
      i.company_id,
      i.id as invoice_id,
      i.quote_id,
      i.contact_id,
      i.total_cents,
      i.created_at,
      sum(p.amount_cents)::bigint as paid_cents,
      min(p.received_at) as first_paid_at
    from public.invoices i
    join public.invoice_payments p on p.invoice_id = i.id and p.organization_id = i.organization_id
    where i.status <> 'void' and p.status = 'succeeded'
    group by i.organization_id, i.company_id, i.id, i.quote_id, i.contact_id, i.total_cents, i.created_at
  ),
  quote_paid as (
    select organization_id, quote_id, sum(paid_cents)::bigint as paid_cents, min(first_paid_at) as first_paid_at
    from invoice_paid
    where quote_id is not null
    group by organization_id, quote_id
  ),
  deals as (
    select
      q.organization_id,
      q.company_id,
      q.id as quote_id,
      null::uuid as invoice_id,
      q.contact_id,
      q.auto_generated,
      q.created_at,
      q.approved_total_cents as approved_cents,
      (case when q.deposit_paid_at is not null then coalesce(q.approved_deposit_cents, q.deposit_cents, 0) else 0 end)::bigint as deposit_cents,
      coalesce(qp.paid_cents, 0)::bigint as invoice_paid_cents,
      q.approved_at,
      coalesce(q.deposit_paid_at, qp.first_paid_at) as paid_at,
      'quote'::text as deal_kind
    from public.quotes q
    left join quote_paid qp on qp.quote_id = q.id and qp.organization_id = q.organization_id
    where q.approved_at is not null or q.deposit_paid_at is not null or qp.quote_id is not null
    union all
    select
      ip.organization_id,
      ip.company_id,
      null::uuid,
      ip.invoice_id,
      ip.contact_id,
      false,
      ip.created_at,
      ip.total_cents,
      0::bigint,
      ip.paid_cents,
      null::timestamptz,
      ip.first_paid_at,
      'invoice'::text
    from invoice_paid ip
    where ip.quote_id is null
  )
  select
    d.organization_id,
    d.company_id,
    d.quote_id,
    d.contact_id,
    d.auto_generated,
    coalesce(ft.source, 'manual') as first_touch_source,
    coalesce(ft.channel, 'manual') as first_touch_channel,
    coalesce(ft.touched_at, d.created_at) as first_touch_at,
    exists (
      select 1 from public.retell_calls rc
      where rc.contact_id = d.contact_id and rc.organization_id = d.organization_id
        and coalesce(rc.received_at, rc.created_at) <= coalesce(d.approved_at, d.paid_at)
    ) as voice_ai_involved,
    exists (
      select 1
      from public.workflow_runs wr
      join public.activity_events ae on ae.id = wr.trigger_event_id
      where wr.organization_id = d.organization_id
        and wr.status = 'completed'
        and ae.entity_type = 'contact'
        and ae.entity_id = d.contact_id
        and wr.created_at <= coalesce(d.approved_at, d.paid_at)
    ) as automation_involved,
    d.approved_cents,
    least(d.deposit_cents + d.invoice_paid_cents, 2147483647)::integer as paid_cents,
    d.approved_at,
    d.paid_at,
    d.invoice_id,
    d.deal_kind,
    d.deposit_cents::integer as deposit_cents,
    least(d.invoice_paid_cents, 2147483647)::integer as invoice_paid_cents
  from deals d
  left join lateral (
    select touches.src as source, touches.chan as channel, touches.ts as touched_at
    from (
      select rl.created_at as ts, 0 as rnk, coalesce(rl.source, rl.source_site, 'web') as src, 'web' as chan
        from public.raw_leads rl
        where rl.contact_id = d.contact_id and rl.organization_id = d.organization_id
      union all
      select coalesce(rc.received_at, rc.created_at) as ts, 1 as rnk, 'retell' as src, 'voice' as chan
        from public.retell_calls rc
        where rc.contact_id = d.contact_id and rc.organization_id = d.organization_id
          and coalesce(rc.direction, 'inbound') = 'inbound'
      union all
      select ml.created_at as ts, 2 as rnk, ml.channel as src, case when ml.channel = 'email' then 'email' else 'sms' end as chan
        from public.message_log ml
        where ml.contact_id = d.contact_id and ml.organization_id = d.organization_id
          and ml.direction = 'inbound'
    ) touches
    where touches.ts is not null
    order by touches.ts asc, touches.rnk asc
    limit 1
  ) ft on true;
