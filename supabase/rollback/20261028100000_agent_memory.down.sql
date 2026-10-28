-- Rollback of 20261028100000_agent_memory.sql (agent memory: turns + notes). The owner agent then
-- works without memory (each text on its own), as before. Notes the owner saved are lost.
drop table if exists public.agent_notes;
drop table if exists public.agent_turns;
