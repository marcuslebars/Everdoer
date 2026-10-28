-- Outbound sales calls (docs/sales-calls.md): the AI calls a lead a set time after they enquire
-- (speed-to-lead), or when the owner asks, to answer questions, quote, and book.
--
-- An AI voice that calls to sell is treated as an automatic dialing-announcing device under the
-- CRTC Unsolicited Telecommunications Rules, so every sales call needs the person's EXPRESS
-- consent to automated calls to that number, recorded with evidence (call_consents), and a "don't
-- call me" is honoured on an internal do-not-call list kept for 3 years + 14 days (do_not_call).
--
--   sales_calls: scheduled → dialing → placed → completed | failed   (+ cancelled | skipped)
--   a no-answer / voicemail attempt schedules the next attempt as a NEW row (attempt + 1).
--
-- Service role only writes; members read their org's rows. Additive and re-runnable.
-- Rollback: supabase/rollback/20261029100000_sales_calls.down.sql

-- 1) Per-company settings ({ enabled, delayMinutes, maxAttempts, retryMinutes, dailyCap, voicemail }).
alter table public.companies add column if not exists sales_call_settings jsonb not null default '{}'::jsonb;

-- 2) Consent to automated calls: one evidence row per grant. Valid while not revoked and the
--    contact's phone still matches phone_last10 (consent is for a NUMBER, not a person).
create table if not exists public.call_consents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  company_id uuid not null,
  contact_id uuid not null,
  phone_last10 text not null check (phone_last10 ~ '^[0-9]{10}$'),
  -- form_optin: a ticked checkbox on our form; owner_attested: the owner says the customer
  -- asked to be called (with the owner's words in evidence); customer_request: the customer asked
  -- us to call them back (e.g. on a call or by text).
  source text not null check (source in ('form_optin', 'owner_attested', 'customer_request')),
  -- The exact wording shown / the owner's words / the request, kept as the consent record.
  evidence text not null check (char_length(evidence) between 1 and 600),
  -- Where it came from (raw lead id, owner approval id, call id …).
  source_ref text,
  captured_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (company_id, organization_id) references public.companies (id, organization_id) on delete cascade,
  foreign key (contact_id, organization_id) references public.contacts (id, organization_id) on delete cascade
);

create index if not exists call_consents_contact_idx
  on public.call_consents (organization_id, company_id, contact_id) where revoked_at is null;

-- 3) Internal do-not-call list, per company and number.
create table if not exists public.do_not_call (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  company_id uuid not null,
  phone_last10 text not null check (phone_last10 ~ '^[0-9]{10}$'),
  contact_id uuid,
  -- call: asked on a sales call; owner: the owner added it; sms_stop: texted STOP.
  source text not null check (source in ('call', 'owner', 'sms_stop')),
  note text check (note is null or char_length(note) <= 300),
  created_at timestamptz not null default now(),
  -- CRTC: kept for 3 years and 14 days from the request.
  expires_at timestamptz not null default (now() + interval '3 years 14 days'),
  unique (company_id, phone_last10),
  foreign key (company_id, organization_id) references public.companies (id, organization_id) on delete cascade
);

-- 4) The call queue.
create table if not exists public.sales_calls (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  company_id uuid not null,
  contact_id uuid not null,
  reason text not null check (reason in ('speed_to_lead', 'owner_request')),
  status text not null default 'scheduled'
    check (status in ('scheduled', 'dialing', 'placed', 'completed', 'failed', 'cancelled', 'skipped')),
  run_at timestamptz not null default now(),
  attempt integer not null default 1 check (attempt between 1 and 5),
  max_attempts integer not null default 2 check (max_attempts between 1 and 5),
  -- The owner phone that asked (owner_request), for the result text; null → the company's owner.
  requested_by_phone text check (requested_by_phone is null or requested_by_phone ~ '^\+[0-9]{8,15}$'),
  -- What the lead asked about / what the owner wants the call to focus on.
  note text check (note is null or char_length(note) <= 400),
  raw_lead_id text,
  claimed_at timestamptz,
  claimed_by text,
  retell_call_id text,
  placed_at timestamptz,
  -- { reached, inVoicemail, salesOutcome, summary, doNotCall, durationMs, … } from call_analyzed.
  outcome jsonb,
  skip_reason text,
  last_error text,
  owner_notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (company_id, organization_id) references public.companies (id, organization_id) on delete cascade,
  foreign key (contact_id, organization_id) references public.contacts (id, organization_id) on delete cascade
);

create index if not exists sales_calls_company_idx
  on public.sales_calls (organization_id, company_id, created_at desc);
create index if not exists sales_calls_due_idx
  on public.sales_calls (run_at) where status = 'scheduled';
create index if not exists sales_calls_retell_call_idx
  on public.sales_calls (retell_call_id) where retell_call_id is not null;
-- One open call per customer.
create unique index if not exists sales_calls_one_open_idx
  on public.sales_calls (company_id, contact_id)
  where status in ('scheduled', 'dialing', 'placed');

-- RLS: members read; only the service role writes.
do $$
declare t text;
begin
  foreach t in array array['call_consents', 'do_not_call', 'sales_calls'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select using (public.is_organization_member(organization_id))', t || '_select', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

drop trigger if exists sales_calls_set_updated_at on public.sales_calls;
create trigger sales_calls_set_updated_at before update on public.sales_calls
  for each row execute procedure public.touch_updated_at();
