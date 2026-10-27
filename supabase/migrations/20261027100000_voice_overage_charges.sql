-- Voice overage billing (docs/billing.md → "Voice overage").
--
-- One row per organization per closed (America/Toronto) month in which its AI call minutes went
-- over the plan allowance: the Front Desk plan's org-wide minutes (marina_reception), or, for
-- Catch / Close, each company's call_answering.included_minutes (the overage of every company
-- summed; the per-company split is in `detail`). The monthly pass (billing/voice-overage.ts)
-- inserts the row as its claim, then — in charge mode — adds one Stripe invoice item (the
-- per-minute STRIPE_PRICE_VOICE_OVERAGE × the minutes over, rounded up) to the customer's next
-- subscription invoice.
--
--   recorded   VOICE_OVERAGE_BILLING=record: worked out, never charged (a dry run, never revisited)
--   skipped    over, but nothing to bill (no Stripe customer)
--   charging → charged | failed (retried up to 3 times; the Stripe idempotency key makes a retry safe)
--
-- Service role only (no client writes); members may read their org's rows (the billing panel).
-- Additive and re-runnable. Rollback: supabase/rollback/20261027100000_voice_overage_charges.down.sql

create table if not exists public.voice_overage_charges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- 'YYYY-MM-01', the Toronto calendar month (usage_monthly_v.month).
  month date not null check (extract(day from month) = 1),
  scope text not null check (scope in ('organization', 'company')),
  included_minutes numeric not null check (included_minutes >= 0),
  used_minutes numeric not null check (used_minutes >= 0),
  -- Whole minutes billed (the overage rounded up).
  overage_minutes integer not null check (overage_minutes > 0),
  -- [{ company_id, included_minutes, used_minutes, overage_minutes }] for company scope.
  detail jsonb not null default '[]'::jsonb,
  status text not null check (status in ('recorded', 'skipped', 'charging', 'charged', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  stripe_customer_id text,
  stripe_price_id text,
  stripe_invoice_item_id text,
  charged_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, month)
);

create index if not exists voice_overage_charges_retry_idx
  on public.voice_overage_charges (month, status) where status in ('charging', 'failed');

alter table public.voice_overage_charges enable row level security;

drop policy if exists "voice_overage_charges_select" on public.voice_overage_charges;
create policy "voice_overage_charges_select" on public.voice_overage_charges
  for select using (public.is_organization_member(organization_id));

revoke insert, update, delete on public.voice_overage_charges from anon, authenticated;
revoke select on public.voice_overage_charges from anon;
grant select on public.voice_overage_charges to authenticated;
grant all on public.voice_overage_charges to service_role;

drop trigger if exists voice_overage_charges_set_updated_at on public.voice_overage_charges;
create trigger voice_overage_charges_set_updated_at before update on public.voice_overage_charges
  for each row execute procedure public.touch_updated_at();
