/** Home ("Today"): greeting, what needs you, today's jobs, money owed, the AI's week. */
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = {
  summary: { newLeadCount: 0, overdueTaskCount: 0, urgentTaskCount: 0, revenueSnapshot: { todayCents: 0, weekCents: 250_000 } } as Record<string, unknown>,
  bookings: [] as Array<Record<string, unknown>>,
  invoiceSummary: { outstandingCents: 480_000, overdueCents: 0, overdueCount: 0, clearingCents: 0 },
};

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ profile: { id: "u1", email: "jane@example.com", fullName: "Jane Roofer" }, session: null }),
}));
vi.mock("@/lib/org-context", () => ({
  useOrg: () => ({ organizationId: "org-1", companyId: null, isValid: true, requiresOnboarding: false }),
}));
vi.mock("@/lib/api-hooks", () => ({
  useDashboardSummary: () => ({ data: state.summary, isLoading: false, isError: false, error: null, refetch: vi.fn() }),
  useCalendarView: () => ({ data: { bookings: { items: state.bookings } }, isLoading: false, isError: false, refetch: vi.fn() }),
}));
vi.mock("@/lib/invoice-hooks", () => ({
  useInvoices: () => ({ data: { invoices: [], summary: state.invoiceSummary }, isLoading: false, isError: false }),
}));
vi.mock("@/components/onboarding/SetupProgress", () => ({ SetupProgressCard: () => null }));
vi.mock("@/components/approvals/ApprovalsCard", () => ({ ApprovalsCard: () => <div data-testid="approvals" /> }));
vi.mock("@/components/reports/WeeklyFrontDeskCard", () => ({ WeeklyFrontDeskCard: () => <div data-testid="weekly" /> }));
vi.mock("@/screens/Dashboard", () => ({
  OnboardingChecklistCard: () => null,
  NoOrgContextState: () => <div>no org</div>,
  DashboardErrorState: ({ message }: { message: string }) => <div>{message}</div>,
}));

import TodayPage from "@/screens/TodayPage";

function renderPage() {
  return render(
    <MemoryRouter>
      <TodayPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  state.summary = { newLeadCount: 0, overdueTaskCount: 0, urgentTaskCount: 0, revenueSnapshot: { todayCents: 0, weekCents: 250_000 } };
  state.bookings = [];
  state.invoiceSummary = { outstandingCents: 480_000, overdueCents: 0, overdueCount: 0, clearingCents: 0 };
});

describe("TodayPage", () => {
  it("a quiet day: greets by first name, all caught up, no jobs, money owed, the AI card", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/, Jane$/);
    expect(screen.getByTestId("all-caught-up")).toBeInTheDocument();
    expect(screen.getByText("No jobs booked today.")).toBeInTheDocument();
    expect(screen.getByTestId("money")).toHaveTextContent("Owed to you");
    expect(screen.getByTestId("approvals")).toBeInTheDocument();
    expect(screen.getByTestId("weekly")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /See everything your AI did/ })).toHaveAttribute("href", "/activity");
  });

  it("a busy day: what needs you links to the right list, jobs in time order", () => {
    state.summary = { ...state.summary, newLeadCount: 2, overdueTaskCount: 1 };
    state.invoiceSummary = { ...state.invoiceSummary, overdueCount: 1, overdueCents: 35_000 };
    state.bookings = [
      { id: "b2", title: "Shingle repair", scheduledFor: "2026-10-30T18:00:00Z", status: "confirmed", contact: { name: "Bob" } },
      { id: "b1", title: "Roof inspection", scheduledFor: "2026-10-30T14:00:00Z", status: "pending", contact: { name: "Ann" } },
      { id: "bx", title: "Cancelled one", scheduledFor: "2026-10-30T15:00:00Z", status: "cancelled", contact: null },
    ];
    renderPage();
    expect(screen.queryByTestId("all-caught-up")).toBeNull();
    expect(screen.getByRole("link", { name: /2 new leads to look at/ })).toHaveAttribute("href", "/crm");
    expect(screen.getByRole("link", { name: /1 overdue invoice/ })).toHaveAttribute("href", "/invoices?filter=overdue");
    expect(screen.getByRole("link", { name: /1 overdue task/ })).toHaveAttribute("href", "/tasks");
    const jobs = screen.getAllByRole("link").filter((a) => a.getAttribute("href")?.startsWith("/calendar?booking="));
    expect(jobs.map((a) => a.getAttribute("href"))).toEqual(["/calendar?booking=b1", "/calendar?booking=b2"]);
    expect(screen.queryByText("Cancelled one")).toBeNull();
  });
});
