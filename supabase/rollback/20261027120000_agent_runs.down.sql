-- Rollback of 20261027120000_agent_runs.sql (agent run log). The log is diagnostic only;
-- nothing else references it.
drop table if exists public.agent_runs;
