-- Back off when texting the owner about an approval fails.
--
-- notifyOwnerOfApproval released its claim (notified_at) whenever a send failed, so the
-- scheduler's sweep retried on every tick. With a send that can never succeed (the platform
-- Twilio account inactive, 2026-10-19..28) that became ~3,800 failed owner texts in 10 days,
-- capped only by the hourly owner-alert budget. Now each failure waits longer before the next
-- try (5 min, 15 min, 1 h, 3 h) and after 5 tries the text is given up: the approval stays on
-- the app's Approvals list and still expires as before.
--
-- Additive and re-runnable. Rollback: supabase/rollback/20261103120000_owner_approval_notify_backoff.down.sql
alter table public.owner_approvals add column if not exists notify_attempts integer not null default 0;
alter table public.owner_approvals add column if not exists notify_retry_at timestamptz;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'owner_approvals_notify_attempts_check') then
    alter table public.owner_approvals
      add constraint owner_approvals_notify_attempts_check check (notify_attempts between 0 and 100);
  end if;
end $$;
