/** Which business a Settings section shows, and AI front desk showing one business at a time. */
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { pickSettingsCompany } from "@/lib/settings-company";

const org = { companyId: null as string | null };
vi.mock("@/lib/org-context", () => ({ useOrg: () => ({ organizationId: "org-1", companyId: org.companyId }) }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ session: { organizations: [{ id: "org-1", membershipRole: "owner" }] } }) }));
vi.mock("@/lib/api-hooks", () => ({
  useCompanies: () => ({
    data: [
      { id: "co-boat", name: "boatnames.ca" },
      { id: "co-a1", name: "A1 Marine Care" },
    ],
    isLoading: false,
  }),
}));
vi.mock("@/lib/front-desk-api", () => ({
  useSmsAgentSettings: () => ({ data: undefined, isLoading: true, isError: false }),
  useUpdateSmsAgentSettings: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { AiFrontDeskSettings } from "@/components/settings/AiFrontDeskSettings";

const list = [{ id: "a" }, { id: "b" }, { id: "c" }];

beforeEach(() => {
  org.companyId = null;
  window.history.replaceState(null, "", "/settings?section=front-desk");
});

describe("pickSettingsCompany (pure)", () => {
  it("picked > ?company= > top bar > first; unknown ids are skipped", () => {
    expect(pickSettingsCompany(list, { picked: "c", fromUrl: "b", fromTopBar: "a" })).toBe("c");
    expect(pickSettingsCompany(list, { picked: null, fromUrl: "b", fromTopBar: "c" })).toBe("b");
    expect(pickSettingsCompany(list, { picked: null, fromUrl: null, fromTopBar: "c" })).toBe("c");
    expect(pickSettingsCompany(list, { picked: "zzz", fromUrl: "nope", fromTopBar: null })).toBe("a");
    expect(pickSettingsCompany([], { picked: "a", fromUrl: null, fromTopBar: null })).toBeNull();
  });
});

describe("AI front desk: one business at a time", () => {
  const slots = [{ id: "estimator", render: ({ companyName }: { companyName: string }) => <p>Estimator for {companyName}</p> }];

  function renderIt() {
    return render(
      <MemoryRouter>
        <AiFrontDeskSettings sections={slots as never} />
      </MemoryRouter>,
    );
  }

  it("shows the first business, and the switcher changes it", () => {
    renderIt();
    expect(screen.getByText("Estimator for boatnames.ca")).toBeInTheDocument();
    expect(screen.queryByText("Estimator for A1 Marine Care")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "A1 Marine Care" }));
    expect(screen.getByText("Estimator for A1 Marine Care")).toBeInTheDocument();
    expect(screen.queryByText("Estimator for boatnames.ca")).toBeNull();
  });

  it("starts on the business chosen in the top bar", () => {
    org.companyId = "co-a1";
    renderIt();
    expect(screen.getByText("Estimator for A1 Marine Care")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "A1 Marine Care" })).toHaveAttribute("aria-selected", "true");
  });

  it("a ?company= link (Your AI → Customize) opens that business", () => {
    window.history.replaceState(null, "", "/settings?section=front-desk&focus=estimator&company=co-a1");
    renderIt();
    expect(screen.getByText("Estimator for A1 Marine Care")).toBeInTheDocument();
  });
});
