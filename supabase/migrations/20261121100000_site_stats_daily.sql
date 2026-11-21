-- Generated-site stats (docs/done-for-you.md → "Generated sites" → "Site stats"): daily counts per
-- site, page and traffic source of visits, call taps and quote requests, shown to the owner in
-- the app. No visitor data at all: no IP, no cookie, no user agent, no URL beyond the site's own
-- page path. Written only by the app server (service role) through site_stats_bump; org members
-- may read their own rows.
create table if not exists public.site_stats_daily (
  site_id uuid not null references public.company_sites (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  day date not null,
  -- '' = the home page, else one of the site's page paths (service / town pages).
  path text not null default '' check (char_length(path) <= 64),
  source text not null check (source in ('google', 'bing', 'facebook', 'instagram', 'ads', 'direct', 'other', 'unknown')),
  views integer not null default 0 check (views >= 0),
  calls integer not null default 0 check (calls >= 0),
  quotes integer not null default 0 check (quotes >= 0),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (site_id, day, path, source)
);

create index if not exists site_stats_daily_company_day_idx on public.site_stats_daily (company_id, day desc);

alter table public.site_stats_daily enable row level security;

drop policy if exists "site_stats_daily_members_select" on public.site_stats_daily;
create policy "site_stats_daily_members_select"
  on public.site_stats_daily for select
  using (public.is_organization_member(organization_id));
-- No insert/update/delete policies: writes go through site_stats_bump (service role only).

-- Atomic add (a plain upsert can't increment). The org and company always come from the site row.
create or replace function public.site_stats_bump(
  p_site uuid,
  p_day date,
  p_path text,
  p_source text,
  p_views integer,
  p_calls integer,
  p_quotes integer
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.site_stats_daily (site_id, organization_id, company_id, day, path, source, views, calls, quotes)
  select s.id, s.organization_id, s.company_id, p_day, coalesce(p_path, ''), p_source,
         greatest(p_views, 0), greatest(p_calls, 0), greatest(p_quotes, 0)
  from public.company_sites s
  where s.id = p_site
  on conflict (site_id, day, path, source) do update
    set views = public.site_stats_daily.views + excluded.views,
        calls = public.site_stats_daily.calls + excluded.calls,
        quotes = public.site_stats_daily.quotes + excluded.quotes,
        updated_at = timezone('utc', now());
$$;
revoke all on function public.site_stats_bump(uuid, date, text, text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.site_stats_bump(uuid, date, text, text, integer, integer, integer) to service_role;
