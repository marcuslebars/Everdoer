/**
 * Simple by default, part 3: Settings shows the everyday sections first with the rest under
 * "Advanced", and the top bar hides the organization switcher when there's only one.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { sections, sectionFromUrl } from "@/lib/settings-sections";

const data: { orgs: Array<{ id: string; name: string }>; companies: Array<{ id: string; name: string }> } = { orgs: [], companies: [] };

vi.mock("@/lib/org-context", () => ({
  useOrg: () => ({ organizationId: "org-1", companyId: null, setOrganizationId: vi.fn(), setCompanyId: vi.fn() }),
}));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { id: "u1", email: "jane@example.com" }, profile: { id: "u1", email: "jane@example.com", fullName: "Jane Roofer" }, signOut: vi.fn(), session: null }),
}));
vi.mock("@/lib/api-hooks", () => ({
  useOrganizations: () => ({ data: data.orgs, isLoading: false }),
  useCompanies: () => ({ data: data.companies, isLoading: false }),
  useDashboardActivity: () => ({ data: [], isLoading: false }),
  useCreateOrganization: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateCompany: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCRMContacts: () => ({ data: undefined }),
}));
vi.mock("@/components/help/HelpPanel", () => ({ HelpButton: () => null }));
vi.mock("@/components/voice/QuickCallDialog", () => ({ QuickCallDialog: () => null }));
vi.mock("@/lib/supabase", () => ({ getSupabaseConfigDiagnostic: () => ({ isConfigured: true }), supabase: {} }));

import { TopBar } from "@/components/layout/TopBar";
import { BrandProvider } from "@/lib/brand-context";

function renderTopBar() {
  return render(
    <MemoryRouter>
      <BrandProvider>
        <TopBar />
      </BrandProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  data.orgs = [{ id: "org-1", name: "Jane's Roofing" }];
  data.companies = [{ id: "co-1", name: "Jane's Roofing" }];
});

describe("settings sections (pure)", () => {
  it("everyday sections first, the technical ones under Advanced; no 'coming soon' placeholder", () => {
    const basics = sections.filter((s) => s.group === "basics").map((s) => s.id);
    const advanced = sections.filter((s) => s.group === "advanced").map((s) => s.id);
    expect(basics).toEqual(["org", "members", "website", "booking", "reviews", "payments", "invoices", "notifications", "billing"]);
    expect(advanced).toEqual(["front-desk", "packs", "voice", "accounting", "visits", "checklists", "integrations"]);
    expect(sections.map((s) => s.id)).not.toContain("appearance");
  });

  it("the URL picks the section, old paths included; unknown → Business", () => {
    expect(sectionFromUrl("/settings", "?section=front-desk&focus=estimator")).toBe("front-desk");
    expect(sectionFromUrl("/settings/payments", "")).toBe("payments");
    expect(sectionFromUrl("/settings/billing", "")).toBe("billing");
    expect(sectionFromUrl("/settings", "?section=appearance")).toBe("org");
    expect(sectionFromUrl("/settings", "")).toBe("org");
  });
});

describe("top bar", () => {
  it("one organization, one company: no organization switcher, no 'All Companies'; New organization is in the account menu", () => {
    renderTopBar();
    expect(screen.queryByText("All Companies")).toBeNull();
    expect(screen.getAllByText("Jane's Roofing").length).toBeGreaterThan(0);
    // The org switcher's wrapper is hidden at every size.
    const orgLabel = screen.queryByText("Organization");
    if (orgLabel) expect(orgLabel.closest("div.hidden")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "JR" }));
    expect(screen.getByRole("button", { name: /New organization/ })).toBeInTheDocument();
  });

  it("several organizations: the switcher is back and the account menu has no New organization", () => {
    data.orgs = [
      { id: "org-1", name: "Jane's Roofing" },
      { id: "org-2", name: "Agency" },
    ];
    data.companies = [
      { id: "co-1", name: "Jane's Roofing" },
      { id: "co-2", name: "Jane's Gutters" },
    ];
    renderTopBar();
    expect(screen.getByText("All Companies")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "JR" }));
    expect(screen.queryByRole("button", { name: /New organization/ })).toBeNull();
  });
});
