import { describe, expect, it } from "vitest";

import { createFakeDb } from "./fake-supabase";
import { loadGreetingContext } from "@/server/services/retell/caller-lookup";

const COMPANY = "a1000000-0000-4000-8000-000000000002";

function db(persona: unknown, dynamicVariables: Record<string, unknown> = {}) {
  return createFakeDb({
    companies: [{ id: COMPANY, name: "A1 Marine Care", timezone: "America/Toronto", agent_persona: persona }],
    company_voice_profiles: [{ company_id: COMPANY, active: true, brand_label: null, dynamic_variables: dynamicVariables }],
  });
}

describe("loadGreetingContext → the name the phone greeting uses", () => {
  it("uses the name the owner chose on Your AI", async () => {
    const g = await loadGreetingContext(db({ name: "Marina" }).client as never, COMPANY);
    expect(g).toMatchObject({ companyName: "A1 Marine Care", agentName: "Marina" });
  });

  it("the Your AI name wins over an older per-number greeting name", async () => {
    const g = await loadGreetingContext(db({ name: "Marina" }, { agent_name: "Sam" }).client as never, COMPANY);
    expect(g.agentName).toBe("Marina");
  });

  it("no Your AI name → the per-number name, then the default", async () => {
    expect((await loadGreetingContext(db({}, { agent_name: "Sam" }).client as never, COMPANY)).agentName).toBe("Sam");
    expect((await loadGreetingContext(db({}).client as never, COMPANY)).agentName).toBe("Everly");
  });
});
