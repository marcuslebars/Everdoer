/** Archived businesses (companies.stage = "archived") drop out of pickers but stay in settings. */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-client", async (orig) => ({
  ...(await orig<typeof import("@/lib/api-client")>()),
  fetchCompanies: vi.fn(async () => [
    { id: "a", name: "A1 Marine Care", stage: "active" },
    { id: "b", name: "A1 Coatings", stage: "archived" },
    { id: "c", name: "boatnames.ca", stage: "prospect" },
  ]),
}));

import { isArchivedCompany, useAllCompanies, useCompanies } from "@/lib/api-hooks";

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

describe("archived businesses", () => {
  it("useCompanies leaves them out; useAllCompanies keeps them", async () => {
    const shown = renderHook(() => useCompanies("org"), { wrapper });
    await waitFor(() => expect(shown.result.current.data).toBeDefined());
    expect(shown.result.current.data!.map((c) => c.name)).toEqual(["A1 Marine Care", "boatnames.ca"]);

    const all = renderHook(() => useAllCompanies("org"), { wrapper });
    await waitFor(() => expect(all.result.current.data).toBeDefined());
    expect(all.result.current.data!).toHaveLength(3);
  });

  it("only the archived stage counts", () => {
    expect(isArchivedCompany({ stage: "archived" })).toBe(true);
    for (const stage of ["active", "prospect", "paused", null]) expect(isArchivedCompany({ stage })).toBe(false);
  });
});
