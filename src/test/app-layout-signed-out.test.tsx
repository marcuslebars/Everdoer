/**
 * A signed-out visit to "/" used to crash the whole app ("The app failed to load") because the
 * app layout read the org context outside OrgProvider. Signed out, the layout now goes straight
 * to /signin without drawing any app chrome.
 */
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ status: "unauthenticated", session: null }) }));
vi.mock("@/lib/org-context", () => ({ useOrg: () => ({ organizationId: "" }) }));
vi.mock("@/lib/realtime", () => ({ useOrgRealtime: vi.fn() }));
vi.mock("@/components/layout/AppSidebar", () => ({ AppSidebar: () => <div>sidebar</div> }));
vi.mock("@/components/layout/TopBar", () => ({ TopBar: () => <div>topbar</div> }));
vi.mock("@/components/layout/MoneyTabs", () => ({ MoneyTabs: () => null }));
vi.mock("@/components/layout/MobileTabBar", () => ({ MobileTabBar: () => <div>tabbar</div> }));
vi.mock("@/components/layout/AutomationNotifier", () => ({ AutomationNotifier: () => null }));

import { AppLayout } from "@/components/layout/AppLayout";

describe("AppLayout signed out", () => {
  it("redirects to /signin and draws no app chrome", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<div>home</div>} />
          </Route>
          <Route path="/signin" element={<div>sign in page</div>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("sign in page")).toBeInTheDocument();
    expect(screen.queryByText("sidebar")).toBeNull();
    expect(screen.queryByText("home")).toBeNull();
  });
});
