/**
 * The app calls the AI what the owner called it (src/lib/assistant-name.tsx): the provider reads
 * the name for the business being worked in, and copy written with the default name follows it.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ name: null as string | null, companyId: null as string | null, asked: [] as string[] }));
vi.mock("@/lib/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-client")>()),
  getYourAiStep: async (_org: string, companyId: string) => {
    h.asked.push(companyId);
    return { view: { companyId, persona: { name: h.name, tone: null, defaultName: "Everly" }, switches: [] }, readiness: {} };
  },
}));
vi.mock("@/lib/api-hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-hooks")>()),
  useOnboardingProgress: () => ({ data: { company: { id: "co-first", name: "Northshore" }, steps: [], nextStep: null } }),
}));
vi.mock("@/lib/org-context", () => ({ useOrg: () => ({ organizationId: "org-1", companyId: h.companyId }) }));
vi.mock("@/lib/brand-context", () => ({ useBrand: () => ({ productLine: "standard" }) }));
vi.mock("@/lib/supabase", () => ({ getSupabaseConfigDiagnostic: () => ({ isConfigured: true }), supabase: {} }));

import { AssistantNameProvider, useAssistantCopy, useAssistantName } from "@/lib/assistant-name";

function Probe() {
  const copy = useAssistantCopy();
  return (
    <p>
      {copy("Call with Everly")} · {useAssistantName() ?? "no name"}
    </p>
  );
}

function renderInProvider() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AssistantNameProvider>
        <Probe />
      </AssistantNameProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  h.name = null;
  h.companyId = null;
  h.asked = [];
});

describe("assistant name", () => {
  it("copy uses the owner's name for their AI", async () => {
    h.name = "Sam";
    renderInProvider();
    expect(await screen.findByText("Call with Sam · Sam")).toBeInTheDocument();
    // No business picked in the top bar: the account's first one.
    expect(h.asked).toEqual(["co-first"]);
  });

  it("no name chosen: the default, Everly", async () => {
    h.companyId = "co-picked";
    renderInProvider();
    expect(await screen.findByText("Call with Everly · no name")).toBeInTheDocument();
    expect(h.asked).toEqual(["co-picked"]);
  });

  it("outside a provider (tests, signed-out pages) copy still renders with the default", () => {
    render(<Probe />);
    expect(screen.getByText("Call with Everly · no name")).toBeInTheDocument();
  });
});
