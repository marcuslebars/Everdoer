-- Rollback for 20261119100000_lifecycle_sends.sql. Drops the send log; with it gone the
-- lifecycle pass would re-send, so turn the pass off (LIFECYCLE_ENABLED=false) before rolling back.
drop table if exists public.lifecycle_sends;
