/** "All companies" on the dashboard sums each business's weekly front-desk numbers. */
import { describe, expect, it } from "vitest";

import { combineWeeklyReportViews, type WeeklyReportMetrics, type WeeklyReportView } from "@/lib/weekly-report-api";

function metrics(over: Partial<WeeklyReportMetrics> = {}): WeeklyReportMetrics {
  return {
    version: 1,
    weekStart: "2026-11-09",
    timeZone: "America/Toronto",
    textConversations: 0,
    approvals: { asked: 0, approved: 0 },
    calls: { answered: 0, afterHours: null, minutes: 0 },
    missedCalls: { caught: 0, textedBack: 0 },
    leads: 0,
    quotes: { sent: 0, approved: 0, approvedCents: 0 },
    jobsBooked: 0,
    collected: { cents: 0, deposits: 0, payments: 0 },
    reviewsRequested: 0,
    currency: "CAD",
    hoursSaved: { minutes: 0, hours: 0, wageValueCents: 0 },
    hasActivity: false,
    ...over,
  };
}

function view(name: string, last: WeeklyReportMetrics, current = metrics()): WeeklyReportView {
  return {
    companyId: name,
    companyName: name,
    timeZone: "America/Toronto",
    isCrankleads: false,
    brandName: "Everdoer",
    settings: { enabled: true, channels: ["sms"] },
    ownerPhoneOnFile: true,
    assumptions: { text: "", values: {} as WeeklyReportView["assumptions"]["values"] },
    weeks: [
      { weekStart: "2026-11-16", label: "Nov 16 – 22", partial: true, metrics: current, send: null },
      { weekStart: "2026-11-09", label: "Nov 9 – 15", partial: false, metrics: last, send: { status: "sent", sentAt: null, channels: [] } },
    ],
  };
}

describe("combineWeeklyReportViews", () => {
  it("a quiet first business no longer hides a busy second one", () => {
    const quiet = view("boatnames.ca", metrics());
    const busy = view(
      "A1 Marine Care",
      metrics({ calls: { answered: 15, afterHours: null, minutes: 20 }, jobsBooked: 3, hasActivity: true, hoursSaved: { minutes: 90, hours: 1.5, wageValueCents: 3000 } }),
    );
    const all = combineWeeklyReportViews([quiet, busy]);
    const last = all.weeks.find((w) => !w.partial)!;
    expect(last.metrics.calls.answered).toBe(15);
    expect(last.metrics.jobsBooked).toBe(3);
    expect(last.metrics.hasActivity).toBe(true);
    expect(last.metrics.hoursSaved.minutes).toBe(90);
    expect(last.metrics.calls.afterHours).toBeNull();
    expect(all.weeks.find((w) => w.partial)!.metrics.hasActivity).toBe(false);
    expect(all.companyName).toBe("All businesses");
  });

  it("sums every counter, and after-hours counts once any business reports them", () => {
    const a = view("a", metrics({ textConversations: 2, calls: { answered: 1, afterHours: 1, minutes: 3 }, collected: { cents: 1000, deposits: 1, payments: 0 } }));
    const b = view("b", metrics({ textConversations: 3, calls: { answered: 2, afterHours: null, minutes: 4 }, collected: { cents: 500, deposits: 0, payments: 1 } }));
    const m = combineWeeklyReportViews([a, b]).weeks[1].metrics;
    expect(m.textConversations).toBe(5);
    expect(m.calls).toEqual({ answered: 3, afterHours: 1, minutes: 7 });
    expect(m.collected).toEqual({ cents: 1500, deposits: 1, payments: 1 });
  });
});
