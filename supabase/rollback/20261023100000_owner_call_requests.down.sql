-- Rollback of 20261023100000_owner_call_requests.sql (owner call requests by text).
-- Open owner_approvals rows of kind 'owner_command' with a call_customer payload simply expire;
-- nothing else references this table.
drop table if exists public.owner_call_requests;
