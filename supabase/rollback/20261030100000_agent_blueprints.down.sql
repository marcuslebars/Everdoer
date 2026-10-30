-- Rollback for 20261030100000_agent_blueprints.sql. Drops the blueprint tables and the persona
-- column (companies fall back to the default assistant name and tone). Applied settings stay as
-- they are on each company; revert any you want undone BEFORE rolling back.
drop table if exists public.agent_blueprint_applications;
drop table if exists public.agent_blueprints;
alter table public.companies drop column if exists agent_persona;
