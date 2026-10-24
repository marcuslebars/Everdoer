-- Owner call requests (docs/owner-call-requests.md): "text me, I'll have Marina call them".
--
-- One row per call the owner asked for by text ("call Dave, tell him the lift is fixed and ask
-- if Thursday still works"). The row is created when the command agent proposes the call, tied
-- to the owner_approvals confirmation (4-digit code), placed once the owner confirms (now, or
-- by the scheduler at `run_at`), and completed by the Retell call_analyzed webhook, which writes
-- the outcome and texts the owner the result once (owner_notified_at is the claim).
--
--   proposed → scheduled → dialing → placed → completed | failed
--            ↘ cancelled | expired
--
-- Service role only (no client writes); members may read their org's rows (the Settings list).
-- Additive and re-runnable. Rollback: supabase/rollback/20261023100000_owner_call_requests.down.sql

create table if not exists public.owner_call_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  company_id uuid not null,
  contact_id uuid not null,
  approval_id uuid references public.owner_approvals (id) on delete set null,
  -- The owner phone that asked (E.164); the result text goes back to this number.
  requested_by_phone text not null check (requested_by_phone ~ '^\+[0-9]{8,15}$'),
  -- OwnerCallBrief (src/server/services/owner-channel/calls.ts): purpose, askFor, ifVoicemail, who.
  brief jsonb not null default '{}'::jsonb,
  status text not null default 'proposed'
    check (status in ('proposed', 'scheduled', 'dialing', 'placed', 'completed', 'failed', 'cancelled', 'expired')),
  -- now() for "now"; the scheduled instant otherwise.
  run_at timestamptz not null default now(),
  claimed_at timestamptz,
  claimed_by text,
  retell_call_id text,
  placed_at timestamptz,
  -- { reached, inVoicemail, summary, answer, sentiment, durationMs } from the call_analyzed payload.
  outcome jsonb,
  owner_notified_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (company_id, organization_id) references public.companies (id, organization_id) on delete cascade,
  foreign key (contact_id, organization_id) references public.contacts (id, organization_id) on delete cascade
);

create index if not exists owner_call_requests_company_status_idx
  on public.owner_call_requests (organization_id, company_id, status, run_at);
create index if not exists owner_call_requests_retell_call_idx
  on public.owner_call_requests (retell_call_id) where retell_call_id is not null;
-- The scheduler's due scan.
create index if not exists owner_call_requests_due_idx
  on public.owner_call_requests (run_at) where status = 'scheduled';
-- At most one open request per customer: a second "call Dave" while one is waiting is refused.
create unique index if not exists owner_call_requests_one_open_idx
  on public.owner_call_requests (company_id, contact_id)
  where status in ('proposed', 'scheduled', 'dialing');

alter table public.owner_call_requests enable row level security;

drop policy if exists "owner_call_requests_select" on public.owner_call_requests;
create policy "owner_call_requests_select" on public.owner_call_requests
  for select using (public.is_organization_member(organization_id));

revoke insert, update, delete on public.owner_call_requests from anon, authenticated;
revoke select on public.owner_call_requests from anon;
grant select on public.owner_call_requests to authenticated;
grant all on public.owner_call_requests to service_role;

drop trigger if exists owner_call_requests_set_updated_at on public.owner_call_requests;
create trigger owner_call_requests_set_updated_at before update on public.owner_call_requests
  for each row execute procedure public.touch_updated_at();
