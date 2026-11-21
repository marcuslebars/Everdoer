-- Rollback for 20261121100000_site_stats_daily.sql (drops the stats; nothing else depends on them).
drop function if exists public.site_stats_bump(uuid, date, text, text, integer, integer, integer);
drop table if exists public.site_stats_daily;
