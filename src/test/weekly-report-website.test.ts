/** The weekly report's "your website" line (site stats, docs/done-for-you.md → "Site stats"). */
import { describe, expect, it } from "vitest";

import { createFakeDb } from "./helpers/fake-supabase";
import { weekRangeForKey } from "@/server/services/monthly-scorecard/weeks";
import { emptyWeeklyMetrics, fetchWebsiteWeek, weeklyHasActivity, type WeeklyReportMetrics } from "@/server/services/weekly-report/metrics";
import { renderWeeklyEmail, renderWeeklySms, smsSegments } from "@/server/templates/weekly-report";

const TZ = "America/Toronto";
const WEEK = "2026-11-16";
const ORG = "org-1";
const options = { companyName: "Northshore Lawn & Snow", platformBrand: "Everdoer", reportUrl: "https://app.everdoer.test/reports/weekly?week=2026-11-16" };

function withWebsite(website: WeeklyReportMetrics["website"], patch: Partial<WeeklyReportMetrics> = {}): WeeklyReportMetrics {
  const m = { ...emptyWeeklyMetrics(WEEK, weekRangeForKey(TZ, WEEK), TZ), website, ...patch };
  return { ...m, hasActivity: weeklyHasActivity(m) };
}

describe("rendering", () => {
  it("the text names website visits and quote requests, still within two segments", () => {
    const sms = renderWeeklySms(withWebsite({ views: 14, calls: 1, quotes: 2 }, { jobsBooked: 3 }), options);
    expect(sms).toContain("14 website visits (2 quote requests)");
    expect(smsSegments(sms).segments).toBeLessThanOrEqual(2);
    expect(renderWeeklySms(withWebsite({ views: 1, calls: 0, quotes: 0 }), options)).toContain("1 website visit.");
  });

  it("the email has a website line with quote requests and call taps", () => {
    const email = renderWeeklyEmail(withWebsite({ views: 14, calls: 1, quotes: 2 }), options);
    expect(email.text).toContain("Visits to your website");
    expect(email.text).toContain("2 quote requests · 1 call tap");
    const none = renderWeeklyEmail(withWebsite(undefined), options);
    expect(none.text).not.toContain("Visits to your website");
  });

  it("website visits alone make it an active week; a zero week doesn't", () => {
    expect(withWebsite({ views: 3, calls: 0, quotes: 0 }).hasActivity).toBe(true);
    expect(withWebsite({ views: 0, calls: 0, quotes: 0 }).hasActivity).toBe(false);
  });
});

describe("reading the week", () => {
  function ctx(site: Record<string, unknown> | null, rows: Record<string, unknown>[]) {
    const db = createFakeDb({
      company_sites: site ? [{ id: "site-1", organization_id: ORG, company_id: "c1", status: "published", ...site }] : [],
      site_stats_daily: rows,
    });
    return { organizationId: ORG, supabase: db.client } as never;
  }
  const row = (day: string, views: number, quotes = 0, calls = 0) => ({ site_id: "site-1", organization_id: ORG, company_id: "c1", day, path: "", source: "google", views, calls, quotes });

  it("adds up Monday to Sunday only, for a published page", async () => {
    const rows = [row("2026-11-15", 50), row("2026-11-16", 4, 1), row("2026-11-22", 3, 0, 2), row("2026-11-23", 99)];
    expect(await fetchWebsiteWeek(ctx({}, rows), "c1", WEEK)).toEqual({ views: 7, calls: 2, quotes: 1 });
    expect(await fetchWebsiteWeek(ctx({ status: "draft" }, rows), "c1", WEEK)).toBeNull();
    expect(await fetchWebsiteWeek(ctx(null, rows), "c1", WEEK)).toBeNull();
  });
});
