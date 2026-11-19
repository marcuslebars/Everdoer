-- Lifecycle messages (docs/lifecycle-emails.md): the trial and new-customer emails from
-- "Marcus at Everdoer", and the operator's texts about signups, go-lives, cancellations and
-- conversions.
--
-- One row per (organization, key). The worker INSERTS (claims) the row before it sends, so a
-- retry, a second worker or a double run can never send the same message twice. Written only by
-- the worker (service role, sanctioned: workers/jobs); org members may read their own rows.
create table if not exists public.lifecycle_sends (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  key text not null check (key in (
    'trial_results', 'trial_ending', 'paid_welcome', 'cancelled',
    'op_signup', 'op_live', 'op_converted', 'op_cancelled'
  )),
  channel text not null check (channel in ('email', 'sms')),
  recipient text,
  status text not null default 'claimed',
  error text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, key)
);

create index if not exists lifecycle_sends_created_idx on public.lifecycle_sends (created_at desc);

drop trigger if exists lifecycle_sends_set_updated_at on public.lifecycle_sends;
create trigger lifecycle_sends_set_updated_at
before update on public.lifecycle_sends
for each row execute procedure public.touch_updated_at();

alter table public.lifecycle_sends enable row level security;

drop policy if exists "lifecycle_sends_members_select" on public.lifecycle_sends;
create policy "lifecycle_sends_members_select"
  on public.lifecycle_sends for select
  using (public.is_organization_member(organization_id));
-- No insert/update/delete policies: writes are service-role only (the worker).
