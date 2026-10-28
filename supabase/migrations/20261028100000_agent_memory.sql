-- Agent memory (docs/agent-kernel.md → "Memory").
--
-- 1) agent_turns — short-term memory: one row per exchange on a channel thread (today the owner's
--    texts: thread_key = the owner's phone). The owner agent reads the last few turns (recent
--    hours) so a follow-up like "actually make it 4pm" knows what "it" is. `actions` is a compact
--    record of what the agent did (tool, key ids, outcome). Purged after 30 days by the worker.
--
-- 2) agent_notes — long-term memory: facts the owner tells the agent to keep, about the business
--    ("closed Dec 24 – Jan 2") or one customer ("Dave prefers mornings"). The agents read them
--    (owner texts, customer texts); the owner adds/forgets them by text. Archived, not deleted.
--
-- Both: service role writes only. Members may read their org's notes; turns are owner/admin
-- read only (they hold the owner's texts). Additive and re-runnable.
-- Rollback: supabase/rollback/20261028100000_agent_memory.down.sql

create table if not exists public.agent_turns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  company_id uuid not null,
  channel text not null check (channel in ('customer_sms', 'owner_sms', 'voice', 'email', 'app', 'system')),
  thread_key text not null check (length(thread_key) between 1 and 200),
  user_text text not null default '',
  reply text,
  intent text,
  -- [{ tool, ok, input, result }] compacted (agent/run-log.ts compact()).
  actions jsonb not null default '[]'::jsonb,
  -- owner_command_log id / sms_conversations id … (what this exchange came in as).
  source_ref text,
  created_at timestamptz not null default now(),
  foreign key (company_id, organization_id) references public.companies (id, organization_id) on delete cascade
);

create index if not exists agent_turns_thread_idx on public.agent_turns (company_id, channel, thread_key, created_at desc);
create index if not exists agent_turns_created_idx on public.agent_turns (created_at);

alter table public.agent_turns enable row level security;
drop policy if exists "agent_turns_select_admin" on public.agent_turns;
create policy "agent_turns_select_admin" on public.agent_turns
  for select using (public.is_organization_admin(organization_id));
revoke insert, update, delete on public.agent_turns from anon, authenticated;
revoke select on public.agent_turns from anon;
grant select on public.agent_turns to authenticated;
grant all on public.agent_turns to service_role;

create table if not exists public.agent_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  company_id uuid not null,
  -- null = about the business; set = about this customer.
  contact_id uuid,
  body text not null check (length(btrim(body)) between 1 and 500),
  source text not null default 'owner_sms' check (source in ('owner_sms', 'app', 'customer_sms', 'voice', 'system')),
  -- The owner phone / profile id that added it.
  created_by text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (company_id, organization_id) references public.companies (id, organization_id) on delete cascade,
  foreign key (contact_id, organization_id) references public.contacts (id, organization_id) on delete cascade
);

create index if not exists agent_notes_active_idx on public.agent_notes (company_id, contact_id, created_at desc) where archived_at is null;

alter table public.agent_notes enable row level security;
drop policy if exists "agent_notes_select_member" on public.agent_notes;
create policy "agent_notes_select_member" on public.agent_notes
  for select using (public.is_organization_member(organization_id));
revoke insert, update, delete on public.agent_notes from anon, authenticated;
revoke select on public.agent_notes from anon;
grant select on public.agent_notes to authenticated;
grant all on public.agent_notes to service_role;

drop trigger if exists agent_notes_set_updated_at on public.agent_notes;
create trigger agent_notes_set_updated_at before update on public.agent_notes
  for each row execute procedure public.touch_updated_at();
