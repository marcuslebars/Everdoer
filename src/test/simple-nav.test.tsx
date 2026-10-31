/**
 * Simple by default: five everyday places in the sidebar (Home, Inbox, Schedule, Customers, Money),
 * everything else under "More", Money's three pages as tabs, and the Home page's day summary.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth: { session: { isOperator?: boolean; activeOrganizationId: string; organizations: unknown[] } | null } = { session: null };

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ status: "authenticated", session: auth.session }),
}));
vi.mock("@/lib/supabase", () => ({ getSupabaseConfigDiagnostic: () => ({ isConfigured: true }), supabase: {} }));

import { AppSidebar } from "@/components/layout/AppSidebar";
import { MoneyTabs } from "@/components/layout/MoneyTabs";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { MORE_NAV, PRIMARY_NAV, isNavActive, isUnderMore, moneyTabFor } from "@/components/layout/nav-items";
import { BrandProvider } from "@/lib/brand-context";
import { greetingFor, needsYouItems, todaysJobs } from "@/lib/today";
import type { BookingCalendarRow } from "@/lib/api-client";

function renderAt(ui: React.ReactNode, path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <BrandProvider>{ui}</BrandProvider>
    </MemoryRouter>,
  );
}

/** The desktop sidebar (the mobile drawer renders the same list a second time). */
function desktopNav() {
  return within(screen.getAllByRole("navigation", { name: "Main" })[0]);
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  auth.session = {
    activeOrganizationId: "org-1",
    organizations: [{ id: "org-1", name: "Jane's Roofing", slug: "jr", membershipRole: "owner" }],
  };
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("nav items (pure)", () => {
  const money = PRIMARY_NAV.find((i) => i.title === "Money")!;
  const home = PRIMARY_NAV.find((i) => i.title === "Home")!;

  it("five primary places, in order", () => {
    expect(PRIMARY_NAV.map((i) => i.title)).toEqual(["Home", "Inbox", "Schedule", "Customers", "Money"]);
  });

  it("every old screen is still in the sidebar (primary or More)", () => {
    const paths = [...PRIMARY_NAV, ...MORE_NAV].flatMap((i) => [i.path, ...(i.alsoActiveOn ?? [])]);
    for (const p of ["/", "/inbox", "/calendar", "/jobs", "/recurring", "/timesheets", "/tasks", "/crm", "/quotes", "/invoices", "/expenses", "/accounts", "/automations", "/reviews", "/reports", "/settings", "/activity"]) {
      expect(paths).toContain(p);
    }
  });

  it("Money lights up on quotes, invoices and expenses (and their sub-pages)", () => {
    for (const p of ["/invoices", "/quotes", "/expenses", "/invoices/abc"]) expect(isNavActive(money, p)).toBe(true);
    expect(isNavActive(money, "/invoicesx")).toBe(false);
    expect(isNavActive(money, "/settings/invoices")).toBe(false);
  });

  it("Home is only the home page", () => {
    expect(isNavActive(home, "/")).toBe(true);
    expect(isNavActive(home, "/crm")).toBe(false);
  });

  it("knows which pages live under More", () => {
    expect(isUnderMore("/reports/weekly")).toBe(true);
    expect(isUnderMore("/settings/billing")).toBe(true);
    expect(isUnderMore("/crm/abc")).toBe(false);
    expect(isUnderMore("/")).toBe(false);
  });

  it("Money tab for a page", () => {
    expect(moneyTabFor("/quotes")).toBe("/quotes");
    expect(moneyTabFor("/expenses/new")).toBe("/expenses");
    expect(moneyTabFor("/crm")).toBeNull();
  });
});

describe("sidebar", () => {
  it("shows the five places; More is closed on an everyday page", () => {
    renderAt(<AppSidebar />, "/");
    const nav = desktopNav();
    for (const title of ["Home", "Inbox", "Schedule", "Customers", "Money"]) expect(nav.getByRole("link", { name: title })).toBeInTheDocument();
    expect(nav.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
    expect(nav.queryByRole("link", { name: "Reports" })).toBeNull();
    expect(nav.getByRole("button", { name: /More/ })).toHaveAttribute("aria-expanded", "false");
  });

  it("opening More shows the rest and is remembered", () => {
    const { unmount } = renderAt(<AppSidebar />, "/");
    fireEvent.click(desktopNav().getByRole("button", { name: /More/ }));
    expect(desktopNav().getByRole("link", { name: "Reports" })).toBeInTheDocument();
    expect(desktopNav().getByRole("link", { name: "Activity" })).toHaveAttribute("href", "/activity");
    unmount();
    renderAt(<AppSidebar />, "/");
    expect(desktopNav().getByRole("link", { name: "Reports" })).toBeInTheDocument();
  });

  it("a page under More opens the group and marks the page", () => {
    renderAt(<AppSidebar />, "/reports/weekly");
    const nav = desktopNav();
    expect(nav.getByRole("button", { name: /More/ })).toHaveAttribute("aria-expanded", "true");
    expect(nav.getByRole("link", { name: "Reports" })).toHaveAttribute("aria-current", "page");
  });

  it("Money is marked on the quotes page", () => {
    renderAt(<AppSidebar />, "/quotes");
    expect(desktopNav().getByRole("link", { name: "Money" })).toHaveAttribute("aria-current", "page");
  });

  it("Concierge only for operators", () => {
    renderAt(<AppSidebar />, "/concierge");
    expect(desktopNav().queryByRole("link", { name: "Concierge" })).toBeNull();
  });

  it("works when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    renderAt(<AppSidebar />, "/");
    fireEvent.click(desktopNav().getByRole("button", { name: /More/ }));
    expect(desktopNav().getByRole("link", { name: "Settings" })).toBeInTheDocument();
  });
});

describe("phone tab bar", () => {
  it("the five places plus More; the current one marked; More opens the menu", () => {
    const onMore = vi.fn();
    renderAt(<MobileTabBar onMore={onMore} />, "/quotes");
    const bar = within(screen.getByRole("navigation", { name: "Quick" }));
    expect(bar.getAllByRole("link").map((a) => a.textContent)).toEqual(["Home", "Inbox", "Schedule", "Customers", "Money"]);
    expect(bar.getByRole("link", { name: "Money" })).toHaveAttribute("aria-current", "page");
    fireEvent.click(bar.getByRole("button", { name: "More" }));
    expect(onMore).toHaveBeenCalledTimes(1);
  });

  it("More is highlighted on a page that lives under it", () => {
    renderAt(<MobileTabBar onMore={() => {}} />, "/reports/weekly");
    const bar = within(screen.getByRole("navigation", { name: "Quick" }));
    expect(bar.getByRole("button", { name: "More" }).className).toMatch(/text-primary/);
    expect(bar.getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current");
  });
});

describe("Money tabs", () => {
  it("on a Money page: Quotes · Invoices · Expenses, current one marked", () => {
    renderAt(<MoneyTabs />, "/expenses");
    const tabs = within(screen.getByRole("navigation", { name: "Money" }));
    expect(tabs.getAllByRole("link").map((a) => a.textContent)).toEqual(["Quotes", "Invoices", "Expenses"]);
    expect(tabs.getByRole("link", { name: "Expenses" })).toHaveAttribute("aria-current", "page");
  });

  it("nothing elsewhere", () => {
    renderAt(<MoneyTabs />, "/crm");
    expect(screen.queryByRole("navigation", { name: "Money" })).toBeNull();
  });
});

describe("Home page helpers (pure)", () => {
  it("greeting by time of day", () => {
    expect(greetingFor(new Date(2026, 9, 30, 8))).toBe("Good morning");
    expect(greetingFor(new Date(2026, 9, 30, 13))).toBe("Good afternoon");
    expect(greetingFor(new Date(2026, 9, 30, 19))).toBe("Good evening");
  });

  it("needs you: leads, overdue invoices (with amount) and overdue tasks; empty when caught up", () => {
    expect(needsYouItems({ newLeadCount: 0, overdueTaskCount: 0, overdueInvoiceCount: 0 })).toEqual([]);
    const items = needsYouItems({ newLeadCount: 1, overdueTaskCount: 3, overdueInvoiceCount: 2, overdueCents: 120_000 });
    expect(items.map((i) => i.key)).toEqual(["leads", "invoices", "tasks"]);
    expect(items[0].label).toBe("1 new lead to look at");
    expect(items[1].label).toMatch(/^2 overdue invoices \(/);
    expect(items[1].to).toBe("/invoices?filter=overdue");
    expect(items[2].label).toBe("3 overdue tasks");
  });

  it("today's jobs: cancelled left out, earliest first", () => {
    const row = (id: string, at: string, status: string) => ({ id, scheduledFor: at, status, title: id }) as BookingCalendarRow;
    const jobs = todaysJobs([row("b", "2026-10-30T15:00:00Z", "confirmed"), row("x", "2026-10-30T09:00:00Z", "cancelled"), row("a", "2026-10-30T13:00:00Z", "pending")]);
    expect(jobs.map((j) => j.id)).toEqual(["a", "b"]);
  });
});
