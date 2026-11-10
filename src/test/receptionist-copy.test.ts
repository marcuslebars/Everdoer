import { describe, expect, it } from "vitest";

import { brandForOrg, platformBrand, PLATFORM_BRANDS, receptionistCopy, receptionistName } from "@/lib/platform-brand";

describe("PR 2: the receptionist copy follows the PRODUCT LINE, not the brand name", () => {
  it("both entries display Everdoer, yet keep their product-line copy", () => {
    expect(PLATFORM_BRANDS.empirevu.name).toBe(PLATFORM_BRANDS.crankleads.name);
    expect(receptionistName({ productLine: "standard" })).toBe("Everly");
    expect(receptionistName({ productLine: "done_for_you" })).toBe("AI receptionist");
    // Old and Phase 3 stored values, and a done-for-you tier with no platform_brand.
    expect(receptionistName(platformBrand("crankleads"))).toBe("AI receptionist");
    expect(receptionistName(platformBrand("done_for_you"))).toBe("AI receptionist");
    expect(receptionistName(platformBrand("standard"))).toBe("Everly");
    expect(receptionistName(brandForOrg({ platform_brand: null, crankleads_tier: "front_desk" }))).toBe("AI receptionist");
    expect(receptionistName(brandForOrg({ platform_brand: "empirevu" }))).toBe("Everly");
  });
});

describe("the AI receptionist's name by brand", () => {
  it("house tenants keep Everly; done-for-you owners never see the name", () => {
    expect(receptionistName(PLATFORM_BRANDS.empirevu)).toBe("Everly");
    expect(receptionistName(PLATFORM_BRANDS.crankleads)).toBe("AI receptionist");
    expect(receptionistCopy("Call with Everly", PLATFORM_BRANDS.empirevu)).toBe("Call with Everly");
    const cl = (t: string) => receptionistCopy(t, PLATFORM_BRANDS.crankleads);
    expect(cl("Call with Everly")).toBe("Call with the AI receptionist");
    expect(cl("Voice (Everly)")).toBe("Voice (AI receptionist)");
    expect(cl("Everly call")).toBe("AI receptionist call");
    expect(cl("Everly is calling Jamie…")).toBe("The AI receptionist is calling Jamie…");
    expect(cl("Everly minutes")).toBe("AI receptionist minutes");
    for (const t of ["Call with Everly", "Voice (Everly)", "Everly call", "Recordings and transcripts of Everly's calls with this lead will appear here."]) {
      expect(cl(t)).not.toMatch(/Everly/);
    }
  });
});

describe("the default name is one word, app and server", () => {
  it("DEFAULT_ASSISTANT_NAME (app copy) is DEFAULT_VOICE_NAME (what the phone says)", async () => {
    const { DEFAULT_ASSISTANT_NAME } = await import("@/lib/platform-brand");
    const { DEFAULT_VOICE_NAME } = await import("@/server/agent/profile");
    const { DEFAULT_AGENT_NAME } = await import("@/server/services/retell/caller-lookup");
    expect(DEFAULT_ASSISTANT_NAME).toBe("Everly");
    expect(DEFAULT_VOICE_NAME).toBe(DEFAULT_ASSISTANT_NAME);
    expect(DEFAULT_AGENT_NAME).toBe(DEFAULT_ASSISTANT_NAME);
  });
});

describe("assistantCopy: the owner's own name for their AI wins", () => {
  it("uses the chosen name everywhere the copy names the assistant", async () => {
    const { assistantCopy } = await import("@/lib/platform-brand");
    expect(assistantCopy("Call with Everly", PLATFORM_BRANDS.empirevu, "Sam")).toBe("Call with Sam");
    expect(assistantCopy("Call a lead with Everly", PLATFORM_BRANDS.crankleads, " Sam ")).toBe("Call a lead with Sam");
    expect(assistantCopy("So Everly can greet them", PLATFORM_BRANDS.empirevu, "Sam")).toBe("So Sam can greet them");
  });

  it("no name chosen: exactly the product-line copy", async () => {
    const { assistantCopy } = await import("@/lib/platform-brand");
    for (const name of [null, undefined, "", "  "]) {
      expect(assistantCopy("Call with Everly", PLATFORM_BRANDS.empirevu, name)).toBe("Call with Everly");
      expect(assistantCopy("Call with Everly", PLATFORM_BRANDS.crankleads, name)).toBe("Call with the AI receptionist");
      expect(assistantCopy("Everly is calling", PLATFORM_BRANDS.crankleads, name)).toBe("The AI receptionist is calling");
    }
  });
});
