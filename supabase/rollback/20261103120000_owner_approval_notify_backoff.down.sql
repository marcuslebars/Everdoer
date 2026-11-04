-- Rollback for 20261103120000_owner_approval_notify_backoff.sql (the code must be rolled back first:
-- it reads these columns).
alter table public.owner_approvals drop constraint if exists owner_approvals_notify_attempts_check;
alter table public.owner_approvals drop column if exists notify_retry_at;
alter table public.owner_approvals drop column if exists notify_attempts;
