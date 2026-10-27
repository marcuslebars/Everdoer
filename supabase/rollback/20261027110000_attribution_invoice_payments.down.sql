-- Rollback of 20261027110000_attribution_invoice_payments.sql: back to deposits-only paid_cents
-- (one row per approved-or-paid quote). The view loses its four added columns, so it is dropped and
-- re-created exactly as 20260912120000 defined it; ui_attribution_summary reads only the original
-- columns and keeps working.
drop view if exists public.revenue_attribution_v;
create view public.revenue_attribution_v
with (security_invoker = true)
as
  select
    q.organization_id,
    q.company_id,
    q.id as quote_id,
    q.contact_id,
    q.auto_generated,
    coalesce(ft.source, 'manual') as first_touch_source,
    coalesce(ft.channel, 'manual') as first_touch_channel,
    coalesce(ft.touched_at, q.created_at) as first_touch_at,
    exists (
      select 1 from public.retell_calls rc
      where rc.contact_id = q.contact_id and rc.organization_id = q.organization_id
        and coalesce(rc.received_at, rc.created_at) <= coalesce(q.approved_at, q.deposit_paid_at)
    ) as voice_ai_involved,
    exists (
      select 1
      from public.workflow_runs wr
      join public.activity_events ae on ae.id = wr.trigger_event_id
      where wr.organization_id = q.organization_id
        and wr.status = 'completed'
        and ae.entity_type = 'contact'
        and ae.entity_id = q.contact_id
        and wr.created_at <= coalesce(q.approved_at, q.deposit_paid_at)
    ) as automation_involved,
    q.approved_total_cents as approved_cents,
    case when q.deposit_paid_at is not null then coalesce(q.approved_deposit_cents, q.deposit_cents) else 0 end as paid_cents,
    q.approved_at,
    q.deposit_paid_at as paid_at
  from public.quotes q
  left join lateral (
    select touches.src as source, touches.chan as channel, touches.ts as touched_at
    from (
      select rl.created_at as ts, 0 as rnk, coalesce(rl.source, rl.source_site, 'web') as src, 'web' as chan
        from public.raw_leads rl
        where rl.contact_id = q.contact_id and rl.organization_id = q.organization_id
      union all
      select coalesce(rc.received_at, rc.created_at) as ts, 1 as rnk, 'retell' as src, 'voice' as chan
        from public.retell_calls rc
        where rc.contact_id = q.contact_id and rc.organization_id = q.organization_id
          and coalesce(rc.direction, 'inbound') = 'inbound'
      union all
      select ml.created_at as ts, 2 as rnk, ml.channel as src, case when ml.channel = 'email' then 'email' else 'sms' end as chan
        from public.message_log ml
        where ml.contact_id = q.contact_id and ml.organization_id = q.organization_id
          and ml.direction = 'inbound'
    ) touches
    where touches.ts is not null
    order by touches.ts asc, touches.rnk asc
    limit 1
  ) ft on true
  where q.approved_at is not null or q.deposit_paid_at is not null;

drop index if exists public.invoice_payments_succeeded_invoice_idx;
