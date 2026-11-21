/** The website stats card (dashboard + Settings → Your website). */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SiteStatsBody } from "@/components/website/SiteStatsCard";
import type { SiteStats } from "@/lib/site-api";

const day = (d: string, views: number) => ({ day: d, views, calls: 0, quotes: 0 });

function stats(patch: Partial<SiteStats> = {}): SiteStats {
  return {
    published: true,
    days: 30,
    totals: { views: 120, calls: 8, quotes: 3 },
    previous: { views: 100, calls: 10, quotes: 0 },
    daily: Array.from({ length: 30 }, (_, i) => day(`2026-11-${String(i + 1).padStart(2, "0")}`, i % 5)),
    sources: [
      { source: "google", label: "Google", views: 80 },
      { source: "direct", label: "Typed in or saved link", views: 40 },
    ],
    pages: [
      { path: "", label: "Home page", views: 90, calls: 6, quotes: 2 },
      { path: "roof", label: "Roof snow removal", views: 30, calls: 2, quotes: 1 },
    ],
    ...patch,
  };
}

describe("SiteStatsBody", () => {
  it("shows the three numbers with the change against the 30 days before", () => {
    render(<SiteStatsBody stats={stats()} />);
    expect(screen.getByTestId("site-stat-views")).toHaveTextContent("120");
    expect(screen.getByTestId("site-stat-calls")).toHaveTextContent("8");
    expect(screen.getByTestId("site-stat-quotes")).toHaveTextContent("3");
    expect(screen.getByText("+20% vs the 30 days before")).toBeInTheDocument();
    expect(screen.getByText("-20% vs the 30 days before")).toBeInTheDocument();
    expect(screen.getByText("Google")).toBeInTheDocument();
    expect(screen.getByText("Roof snow removal")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Visits per day, last 30 days" })).toBeInTheDocument();
  });

  it("says what to do when nothing has been counted yet", () => {
    const zero = { views: 0, calls: 0, quotes: 0 };
    const { rerender } = render(<SiteStatsBody stats={stats({ totals: zero, previous: zero, sources: [], pages: [] })} />);
    expect(screen.getByText(/No visits counted yet/)).toBeInTheDocument();
    rerender(<SiteStatsBody stats={stats({ published: false, totals: zero, previous: zero, sources: [], pages: [] })} />);
    expect(screen.getByText("Publish your page to start counting visits.")).toBeInTheDocument();
  });
});
