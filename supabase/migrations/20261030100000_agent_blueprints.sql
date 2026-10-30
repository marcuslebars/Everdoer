-- Agent profiles + blueprints (docs/agent-blueprints.md).
--
--   companies.agent_persona — the assistant's name and tone, read by every prompt (phone,
--     texting, sales calls). {} = the defaults ("Marina", the built-in tone).
--   agent_blueprints — versioned snapshots of one business's PORTABLE AI setup (persona, every AI
--     role's tuning, booking / review / invoice / sales-call policy). Tenant-specific data (emails,
--     phone numbers, pay calendars, tax facts, paused state, plan minutes) is never stored.
--     Platform-level: made and applied by the operator (job:agent-blueprint), and one blueprint per
--     industry pack can be the default new done-for-you tenants of that trade get.
--   agent_blueprint_applications — every apply, with the target's previous values so it can be
--     reverted.
--
-- Service role only (no client access). Additive and re-runnable.
-- Rollback: supabase/rollback/20261030100000_agent_blueprints.down.sql

alter table public.companies add column if not exists agent_persona jsonb not null default '{}'::jsonb;

create table if not exists public.agent_blueprints (
  id uuid primary key default gen_random_uuid(),
  name text not null check (name ~ '^[A-Za-z0-9][A-Za-z0-9 ._-]{1,79}$'),
  version integer not null check (version >= 1),
  description text check (description is null or char_length(description) <= 500),
  -- The industry pack this blueprint is for (packs/*), if any.
  pack_id text check (pack_id is null or pack_id ~ '^[a-z0-9-]{2,60}$'),
  -- New done-for-you tenants of pack_id get this blueprint (tuning only; their plan decides what's on).
  default_for_pack boolean not null default false,
  source_organization_id uuid references public.organizations (id) on delete set null,
  source_company_id uuid references public.companies (id) on delete set null,
  -- BlueprintContent (src/server/agent/blueprints/content.ts), schema 1.
  content jsonb not null check (jsonb_typeof(content) = 'object' and (content ->> 'schema') = '1'),
  created_by text not null check (char_length(created_by) between 1 and 200),
  created_at timestamptz not null default now(),
  unique (name, version),
  check (not default_for_pack or pack_id is not null)
);

-- One default per pack.
create unique index if not exists agent_blueprints_default_for_pack_idx
  on public.agent_blueprints (pack_id) where default_for_pack;

create table if not exists public.agent_blueprint_applications (
  id uuid primary key default gen_random_uuid(),
  blueprint_id uuid not null references public.agent_blueprints (id) on delete restrict,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  company_id uuid not null,
  -- full: everything in the blueprint; tuning: role on/off switches left to the plan (new tenants).
  mode text not null check (mode in ('full', 'tuning')),
  applied_by text not null check (char_length(applied_by) between 1 and 200),
  -- The target's values before the apply, for revert: { persona, columns: {…}, aiSettings: {section: value | null} }.
  previous jsonb not null,
  -- The leaf paths that changed (for the record and the preview).
  changes jsonb not null default '[]'::jsonb,
  applied_at timestamptz not null default now(),
  reverted_at timestamptz,
  foreign key (company_id, organization_id) references public.companies (id, organization_id) on delete cascade
);

create index if not exists agent_blueprint_applications_company_idx
  on public.agent_blueprint_applications (organization_id, company_id, applied_at desc);

do $$
declare t text;
begin
  foreach t in array array['agent_blueprints', 'agent_blueprint_applications'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;
