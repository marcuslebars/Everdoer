/**
 * "Your website" stats: the last 30 days of visits, call taps and quote requests from the
 * company's generated site, with where visitors came from and the busiest pages. Shown on the
 * dashboard (once the site is live) and in Settings → Your website.
 */
import { AppWindow, ArrowDownRight, ArrowUpRight, MousePointerClick, Phone, FileText } from "lucide-react";
import { Link } from "react-router-dom";

import { Card, CardContent } from "@/components/ui/card";
import { useSiteStats, type SiteStatCounts, type SiteStats } from "@/lib/site-api";
import { cn } from "@/lib/utils";

const METRICS: Array<{ key: keyof SiteStatCounts; label: string; icon: typeof Phone }> = [
  { key: "views", label: "Visits", icon: MousePointerClick },
  { key: "calls", label: "Call taps", icon: Phone },
  { key: "quotes", label: "Quote requests", icon: FileText },
];

function change(now: number, before: number): { text: string; up: boolean } | null {
  if (before === 0) return now > 0 ? null : null;
  const pct = Math.round(((now - before) / before) * 100);
  if (pct === 0) return { text: "Same as the 30 days before", up: true };
  return { text: `${pct > 0 ? "+" : ""}${pct}% vs the 30 days before`, up: pct > 0 };
}

export function SiteStatsBody({ stats }: { stats: SiteStats }) {
  const max = Math.max(1, ...stats.daily.map((d) => d.views));
  const empty = stats.totals.views + stats.totals.calls + stats.totals.quotes === 0;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {METRICS.map(({ key, label, icon: Icon }) => {
          const delta = change(stats.totals[key], stats.previous[key]);
          return (
            <div key={key} className="rounded-lg bg-secondary/50 p-3">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Icon className="w-3.5 h-3.5" /> {label}
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-foreground" data-testid={`site-stat-${key}`}>
                {stats.totals[key].toLocaleString("en-CA")}
              </p>
              {delta && (
                <p className={cn("mt-0.5 flex items-center gap-0.5 text-[11px]", delta.up ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
                  {delta.up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  {delta.text}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {empty ? (
        <p className="text-sm text-muted-foreground">
          {stats.published ? "No visits counted yet. Share your link, and visits, call taps and quote requests will show up here." : "Publish your page to start counting visits."}
        </p>
      ) : (
        <>
          <div aria-label={`Visits per day, last ${stats.days} days`} role="img" className="flex h-16 items-end gap-[2px]">
            {stats.daily.map((d) => (
              <div
                key={d.day}
                title={`${d.day}: ${d.views} visit${d.views === 1 ? "" : "s"}`}
                className="flex-1 rounded-sm bg-primary/70"
                style={{ height: `${Math.max(d.views ? 8 : 2, Math.round((d.views / max) * 100))}%`, opacity: d.views ? 1 : 0.25 }}
              />
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {stats.sources.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">Where visitors came from</p>
                <ul className="space-y-1 text-sm">
                  {stats.sources.slice(0, 5).map((s) => (
                    <li key={s.source} className="flex justify-between gap-2">
                      <span className="text-foreground">{s.label}</span>
                      <span className="tabular-nums text-muted-foreground">{s.views}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {stats.pages.length > 1 && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">Busiest pages</p>
                <ul className="space-y-1 text-sm">
                  {stats.pages.slice(0, 5).map((p) => (
                    <li key={p.path} className="flex justify-between gap-2">
                      <span className="min-w-0 truncate text-foreground">{p.label}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {p.views}
                        {p.quotes ? ` · ${p.quotes} quote${p.quotes === 1 ? "" : "s"}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </>
      )}
      <p className="text-[11px] text-muted-foreground">
        Call taps are taps on your number on the page. Visits count each page once per visit. We don't use cookies or keep anything about visitors.
      </p>
    </div>
  );
}

/** Dashboard card: only once the company's site is live. */
export function SiteStatsDashboardCard({ orgId, companyId }: { orgId: string; companyId: string | null }) {
  const { data } = useSiteStats(orgId, companyId);
  if (!data || !data.published) return null;
  return (
    <Card className="opacity-0 animate-fade-in" style={{ animationDelay: "90ms" }}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <AppWindow className="w-4 h-4 text-muted-foreground" /> Your website, last {data.days} days
          </h2>
          <Link to="/settings/website" className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2">
            Website settings
          </Link>
        </div>
        <SiteStatsBody stats={data} />
      </CardContent>
    </Card>
  );
}

/** Settings → Your website. */
export function SiteStatsSettingsCard({ orgId, companyId }: { orgId: string; companyId: string }) {
  const { data } = useSiteStats(orgId, companyId);
  if (!data) return null;
  return (
    <div className="rounded-xl border border-border p-4 space-y-3">
      <h3 className="text-sm font-semibold text-foreground">Last {data.days} days</h3>
      <SiteStatsBody stats={data} />
    </div>
  );
}
