-- Agent run log (docs/agent-kernel.md → "Run log").
--
-- One row per agent run on any channel: what the agent was asked (the trigger), every tool it
-- called (inputs and results, truncated and with secret-looking keys redacted), how it stopped,
-- what it replied, tokens and time. The kernel (src/server/agent/run-log.ts) writes it after each
-- run, best-effort (a failed write never fails the run). Owners/admins read their org's runs;
-- members and anon read nothing; only the service role writes. Rows older than 90 days are
-- purged by the worker (AGENT_RUN_RETENTION_DAYS).
--
-- Additive and re-runnable. Rollback: supabase/rollback/20261027120000_agent_runs.down.sql

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  company_id uuid,
  channel text not null check (channel in ('customer_sms', 'owner_sms', 'voice', 'email', 'app', 'system')),
  -- What started the run: an sms_conversations id, an owner_command_log id, a call id …
  trigger_ref text,
  model text,
  status text not null check (status in ('final', 'max_rounds', 'timeout', 'stopped', 'error')),
  rounds integer not null default 0 check (rounds >= 0),
  -- [{ name, is_error, input, result }] (each input/result ≤ ~2 KB of JSON).
  tool_calls jsonb not null default '[]'::jsonb,
  tool_count integer not null default 0 check (tool_count >= 0),
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  cache_write_tokens integer not null default 0,
  duration_ms integer not null default 0 check (duration_ms >= 0),
  reply text,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists agent_runs_org_created_idx on public.agent_runs (organization_id, created_at desc);
create index if not exists agent_runs_company_created_idx on public.agent_runs (company_id, created_at desc) where company_id is not null;
create index if not exists agent_runs_created_idx on public.agent_runs (created_at);

alter table public.agent_runs enable row level security;

drop policy if exists "agent_runs_select_admin" on public.agent_runs;
create policy "agent_runs_select_admin" on public.agent_runs
  for select using (public.is_organization_admin(organization_id));

revoke insert, update, delete on public.agent_runs from anon, authenticated;
revoke select on public.agent_runs from anon;
grant select on public.agent_runs to authenticated;
grant all on public.agent_runs to service_role;
