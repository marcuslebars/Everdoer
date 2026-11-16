/**
 * Everdoer's own alerts and the house businesses' alerts go to separate inboxes.
 *
 * Until 16 Nov 2026 one address (OWNER_EMAIL / LEAD_NOTIFY_EMAIL, an A1 Marine Care inbox) got
 * both. The mail provider blocked that inbox after one rejected alert, and for six weeks every
 * A1 lead alert AND every everdoer.com enquiry, purchase alert and support request went nowhere.
 * EVERDOER_OPERATOR_EMAIL is the platform's inbox; OWNER_EMAIL / LEAD_NOTIFY_EMAIL stay A1's.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { operatorEmailAddress } from "@/server/services/help/support";
import { isPlatformSiteLead, leadNotifyRecipient, sendLeadNotification, type NotifyLead } from "@/server/services/lead-intake/notify";
import { platformOperatorEmail } from "@/server/services/operator-email";
import { readOperatorHealthConfig } from "@/server/services/operator-health/service";

const A1 = "contact@a1marinecare.example";
const EVERDOER = "hello@everdoer.example";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("platformOperatorEmail", () => {
  it("is EVERDOER_OPERATOR_EMAIL when set, trimmed", () => {
    expect(platformOperatorEmail({ EVERDOER_OPERATOR_EMAIL: ` ${EVERDOER} `, OWNER_EMAIL: A1 })).toBe(EVERDOER);
  });

  it("falls back to OWNER_EMAIL when unset or blank: exactly where these alerts went before", () => {
    expect(platformOperatorEmail({ OWNER_EMAIL: A1 })).toBe(A1);
    expect(platformOperatorEmail({ EVERDOER_OPERATOR_EMAIL: "  ", OWNER_EMAIL: A1 })).toBe(A1);
    expect(platformOperatorEmail({})).toBeNull();
  });

  it("is what support requests and the daily health email use", () => {
    vi.stubEnv("OWNER_EMAIL", A1);
    vi.stubEnv("EVERDOER_OPERATOR_EMAIL", EVERDOER);
    expect(operatorEmailAddress()).toBe(EVERDOER);
    expect(readOperatorHealthConfig({ OWNER_EMAIL: A1, EVERDOER_OPERATOR_EMAIL: EVERDOER }).recipient).toBe(EVERDOER);
    // Without the new variable, nothing changes.
    expect(readOperatorHealthConfig({ OWNER_EMAIL: A1 }).recipient).toBe(A1);
    vi.stubEnv("EVERDOER_OPERATOR_EMAIL", "");
    expect(operatorEmailAddress()).toBe(A1);
  });
});

describe("who gets a new-lead alert", () => {
  const env = { LEAD_NOTIFY_EMAIL: A1, OWNER_EMAIL: A1, EVERDOER_OPERATOR_EMAIL: EVERDOER };

  it("an enquiry from everdoer.com goes to the platform inbox", () => {
    for (const site of ["crankleads", "everdoer", " Everdoer ", "CRANKLEADS"]) {
      expect(isPlatformSiteLead(site), site).toBe(true);
      expect(leadNotifyRecipient(site, env), site).toBe(EVERDOER);
    }
  });

  it("an A1 lead, and a lead we couldn't route, go to the house inbox", () => {
    for (const site of ["a1marinecare", "a1marinestorage", "a1coatings", "boatnames", "embed", "", null, undefined]) {
      expect(isPlatformSiteLead(site), String(site)).toBe(false);
      expect(leadNotifyRecipient(site, env), String(site)).toBe(A1);
    }
  });

  it("without EVERDOER_OPERATOR_EMAIL every lead goes where it always did (LEAD_NOTIFY_EMAIL, else OWNER_EMAIL)", () => {
    expect(leadNotifyRecipient("crankleads", { LEAD_NOTIFY_EMAIL: "leads@x.test", OWNER_EMAIL: A1 })).toBe("leads@x.test");
    expect(leadNotifyRecipient("crankleads", { OWNER_EMAIL: A1 })).toBe(A1);
    expect(leadNotifyRecipient("a1marinecare", { OWNER_EMAIL: A1 })).toBe(A1);
    expect(leadNotifyRecipient("a1marinecare", {})).toBeNull();
  });

  it("sends each alert to its own inbox, signed with its own name", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("OUTBOUND_FROM_EMAIL", "noreply@everdoer.example");
    vi.stubEnv("LEAD_FROM_EMAIL", "");
    vi.stubEnv("LEAD_NOTIFY_EMAIL", A1);
    vi.stubEnv("OWNER_EMAIL", A1);
    vi.stubEnv("EVERDOER_OPERATOR_EMAIL", EVERDOER);
    const sent: Array<{ to: string[]; from: string; subject: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string }) => {
        sent.push(JSON.parse(init.body));
        return { ok: true, status: 200, text: async () => "" };
      }),
    );
    const lead = (over: Partial<NotifyLead>): NotifyLead => ({
      leadId: "lead_1",
      source: "x",
      sourceSite: null,
      formType: "contact",
      schemaValid: true,
      companyName: null,
      contact: { name: "Pat" },
      message: null,
      lineItems: null,
      returning: null,
      crossBrandBrands: [],
      ...over,
    });

    expect(await sendLeadNotification(lead({ sourceSite: "crankleads", source: "crankleads-question" }))).toBe(true);
    expect(await sendLeadNotification(lead({ sourceSite: "a1marinecare", source: "retell_voice_agent", companyName: "A1 Marine Care" }))).toBe(true);

    expect(sent[0].to).toEqual([EVERDOER]);
    expect(sent[0].from).toBe("Everdoer leads <noreply@everdoer.example>");
    expect(sent[1].to).toEqual([A1]);
    expect(sent[1].from).toBe("A1 Marine Care leads <noreply@everdoer.example>");
  });
});

describe("the house businesses' own notifications", () => {
  it("still fall back to OWNER_EMAIL only: the platform inbox never receives a house company's owner notifications", () => {
    const messaging = readFileSync(join(process.cwd(), "src/server/services/workflow-engine/messaging.ts"), "utf8");
    expect(messaging).toContain("process.env.OWNER_EMAIL");
    expect(messaging).not.toContain("EVERDOER_OPERATOR_EMAIL");
    expect(messaging).not.toContain("platformOperatorEmail");
  });
});
