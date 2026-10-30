/**
 * Agent profiles + blueprints (docs/agent-blueprints.md): the persona and where prompts use it,
 * what a blueprint captures and strips, how it applies (merge, tuning mode, name filling,
 * catalog-filtered weather services), the DB service (versions, apply + revert, new-tenant
 * defaults), and the operator job's arguments.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/services/voice/resync", () => ({ resyncReceptionistAgent: vi.fn(async () => ({ status: "not_provisioned" })) }));

import { BUSINESS_NAME_TOKEN, extractBlueprint, genericText, isContactValue, planBlueprint, readBlueprintContent } from "@/server/agent/blueprints/content";
import { applyBlueprint, applyDefaultBlueprintForPack, findBlueprint, revertApplication, saveBlueprintFromCompany, setDefaultForPack } from "@/server/agent/blueprints/service";
import { cleanPersonaName, parsePersona, toneLine, voiceName } from "@/server/agent/profile";
import { parseBlueprintArgs, runBlueprintJob } from "@/server/jobs/agent-blueprint";
import { buildReceptionistPrompt } from "@/server/services/retell/provision";
import { buildSalesCallPrompt, outboundOpeningLine, salesOpeningLine } from "@/server/services/retell/outbound-prompt";
import { createFakeDb, type FakeDb } from "@/test/helpers/fake-supabase";

const SOURCE = {
  id: "co-src",
  organization_id: "org-src",
  name: "Northshore Snow",
  agent_persona: { name: "Sam", tone: "casual" },
  industry_pack: { id: "property-maintenance-snow", version: 3, appliedAt: "2026-10-01T00:00:00Z" },
  ai_settings: {
    sms_agent: { enabled: true, autonomy: "ask_first" },
    owner_pause: { at: "2026-10-20T00:00:00Z", workflow_ids: ["wf-1"] },
    call_answering: { mode: "ai", included_minutes: 500 },
    collections: { enabled: true, reminderDays: [3, 7] },
    tax_clerk: { receipts: { enabled: true }, hst: { registrant: true, frequency: "annual", accountant_email: "cpa@books.test", reminders: true } },
    recruiter: { payroll: { enabled: true, frequency: "weekly", anchor_date: "2026-01-05", csv_email: "pay@northshore.test" } },
    dispatch: { weather: { enabled: true, sensitive: ["snow_plowing", "salting"] }, on_our_way: { enabled: true } },
    marketing: { win_back: { enabled: true, months_min: 6 } },
  },
  booking_policy: { windows: [{ key: "am", start: "08:00", end: "12:00" }] },
  online_booking_settings: null,
  visit_settings: {},
  review_settings: { enabled: true, template: "Thanks for choosing Northshore Snow! Reply to 705-555-0100 or email hello@northshore.test" },
  sales_call_settings: { enabled: true, delayMinutes: 3 },
  digest: null,
  monthly_scorecard: null,
  invoice_settings: { numberPrefix: "NS", paymentTermsDays: 15, etransferEmail: "pay@northshore.test", chequePayableTo: "Northshore Snow Ltd", footerText: "Thank you - Northshore Snow" },
  cancellation_policy_text: "Northshore Snow needs 24 hours notice to cancel.",
  quote_terms_text: null,
  quote_deposit_flat_cents: 5000,
};

describe("persona", () => {
  it("cleans names and tones; the default keeps today's prompts", () => {
    expect(cleanPersonaName("  sam ")).toBe("Sam");
    expect(cleanPersonaName("Mary-Jo")).toBe("Mary-Jo");
    expect(cleanPersonaName("<b>Bob</b>")).toBeNull();
    expect(cleanPersonaName("A")).toBeNull();
    expect(parsePersona({ name: "zoë", tone: "loud" })).toEqual({ name: "Zoë", tone: null });
    expect(voiceName(parsePersona({}))).toBe("Marina");
    expect(toneLine({ name: null, tone: null })).toBeNull();

    const plain = buildReceptionistPrompt({ companyName: "Northshore", services: [] });
    expect(plain).toContain("You are Marina, the automated phone assistant for Northshore.");
    expect(plain).toContain("Be warm, concise, and helpful. Your goals:");
    const sam = buildReceptionistPrompt({ companyName: "Northshore", services: [], persona: { name: "Sam", tone: "professional" } });
    expect(sam).toContain("You are Sam, the automated phone assistant for Northshore.");
    expect(sam).toContain("Be polite, professional and concise. No slang, no emoji. Your goals:");
  });

  it("opening lines use the name only when one is set", () => {
    expect(salesOpeningLine({ companyName: "Northshore", customerName: "Dana", persona: { name: "Sam", tone: null } })).toBe("Hi, is this Dana? This is Sam, the automated assistant calling for Northshore, and this call may be recorded.");
    expect(salesOpeningLine({ companyName: "Northshore", customerName: null })).toBe("Hi. This is the automated assistant calling for Northshore, and this call may be recorded.");
    expect(outboundOpeningLine({ companyName: "Northshore", customerName: "Dana", persona: { name: "Sam", tone: null } })).toBe("Hi, is this Dana? This is Sam, Northshore's automated assistant calling.");
    const prompt = buildSalesCallPrompt({ companyName: "Northshore", customerName: "Dana", services: [], hoursText: null, serviceArea: null, transferNumber: null, reason: "speed_to_lead", note: null, callbackNumber: null, voicemail: "hang_up", attempt: 1, persona: { name: "Sam", tone: "casual" } });
    expect(prompt.startsWith("You are Sam, the automated phone assistant for Northshore.")).toBe(true);
    expect(prompt).toContain("Keep it relaxed, plain-spoken and upbeat");
  });
});

const OPTS = { mode: "full" as const, catalogKeys: [] as string[], hasBookings: false };

describe("blueprint content", () => {
  const content = extractBlueprint(SOURCE);

  it("captures the portable setup and the pack", () => {
    expect(content.persona).toEqual({ name: "Sam", tone: "casual" });
    expect(content.industryPackId).toBe("property-maintenance-snow");
    expect(content.aiSettings.sms_agent).toEqual({ enabled: true, autonomy: "ask_first" });
    expect(content.aiSettings.collections).toEqual({ enabled: true, reminderDays: [3, 7] });
    expect(content.columns.sales_call_settings).toEqual({ enabled: true, delayMinutes: 3 });
    expect(content.columns.quote_deposit_flat_cents).toBe(5000);
    expect(content.columns.booking_policy).toBeDefined();
    expect(content.columns.visit_settings).toBeUndefined(); // empty
    expect(content.columns.online_booking_settings).toBeUndefined(); // null
  });

  it("never captures tenant data", () => {
    const text = JSON.stringify(content);
    expect(content.aiSettings.owner_pause).toBeUndefined();
    expect(content.aiSettings.call_answering).toEqual({ mode: "ai" });
    expect(content.aiSettings.tax_clerk).toEqual({ receipts: { enabled: true }, hst: { reminders: true } });
    expect(content.aiSettings.recruiter).toEqual({ payroll: { enabled: true } });
    // Prefix, tax rate, payment methods and their details are the business's own.
    expect(content.columns.invoice_settings).toEqual({ paymentTermsDays: 15, footerText: `Thank you - ${BUSINESS_NAME_TOKEN}` });
    for (const secret of ["cpa@books.test", "pay@northshore.test", "2026-01-05", "wf-1", "included_minutes", "705-555-0100", "hello@northshore.test", "weekly", "NS\""]) expect(text).not.toContain(secret);
    expect(isContactValue("+1 (705) 555-0100")).toBe(true);
    expect(isContactValue("Snow 2026")).toBe(false);
  });

  it("makes text generic: names, phones (incl. local), emails, links and tax numbers", () => {
    expect(genericText("Call Bay Snow Co at 555-0199 or (705) 555-0100, see g.page/bay-snow or https://bay.ca/reviews. HST 123456789 RT0001. Email a@b.ca", ["Bay Snow Co"])).toBe(
      "Call {{business_name}} at {{business_phone}} or {{business_phone}}, see {{business_website}} or {{business_website}} HST {{tax_number}}. Email {{business_email}}",
    );
    // The display name counts too.
    expect(extractBlueprint({ ...SOURCE, brand_from_name: "NS Snow", cancellation_policy_text: "NS Snow needs notice." }).columns.cancellation_policy_text).toBe(`${BUSINESS_NAME_TOKEN} needs notice.`);
  });

  it("fills placeholders from the target, and never writes one the target can't fill", () => {
    const review = (content.columns.review_settings as { template: string }).template;
    expect(review).toBe(`Thanks for choosing ${BUSINESS_NAME_TOKEN}! Reply to {{business_phone}} or email {{business_email}}`);
    const withContacts = planBlueprint(content, { name: "Bayside", agent_persona: {}, ai_settings: {}, brand_reply_phone: "(416) 555-0199", brand_reply_email: "hi@bayside.test" }, OPTS);
    expect((withContacts.columns.review_settings as { template: string }).template).toBe("Thanks for choosing Bayside! Reply to (416) 555-0199 or email hi@bayside.test");
    const without = planBlueprint(content, { name: "Bayside", agent_persona: {}, ai_settings: {} }, OPTS);
    expect(without.columns.review_settings).toBeUndefined();
    expect(without.skipped.join(" ")).toContain("review_settings: the text needs the business's phone, email");
    expect(JSON.stringify(without)).not.toContain("{{business_");
  });

  it("round-trips, and an old snapshot can't carry skipped data back in", () => {
    expect(readBlueprintContent(JSON.parse(JSON.stringify(content)))).toEqual(content);
    expect(readBlueprintContent({ schema: 2 })).toBeNull();
    const old = readBlueprintContent({ schema: 1, aiSettings: { owner_pause: { at: "x" }, tax_clerk: { hst: { accountant_email: "x@y.ca", reminders: true } } }, columns: { invoice_settings: { taxRateBps: 1300, paymentTermsDays: 30 } } });
    expect(old?.aiSettings).toEqual({ tax_clerk: { hst: { reminders: true } } });
    expect(old?.columns.invoice_settings).toEqual({ paymentTermsDays: 30 });
  });

  it("applies onto a target: blueprint wins, the target keeps its own facts, its name is filled in", () => {
    const target = {
      name: "Bayside Lawn & Snow",
      agent_persona: {},
      ai_settings: { tax_clerk: { hst: { registrant: false, accountant_email: "mine@cpa.test" } }, sms_agent: { enabled: false }, owner_pause: { at: "x" } },
      invoice_settings: { etransferEmail: "bayside@pay.test", numberPrefix: "BL", taxRateBps: 1500 },
      cancellation_policy_text: null,
    };
    const plan = planBlueprint(content, target, { ...OPTS, catalogKeys: ["salting"] });
    expect(plan.persona).toEqual({ name: "Sam", tone: "casual" });
    expect(plan.aiSections.sms_agent).toEqual({ enabled: true, autonomy: "ask_first" });
    expect(plan.aiSections.tax_clerk).toEqual({ receipts: { enabled: true }, hst: { registrant: false, accountant_email: "mine@cpa.test", reminders: true } });
    expect(plan.aiSettingsNext.owner_pause).toEqual({ at: "x" }); // the target's own state is untouched
    expect((plan.aiSections.dispatch as { weather: { sensitive: string[] } }).weather.sensitive).toEqual(["salting"]);
    expect(plan.columns.invoice_settings).toEqual({ etransferEmail: "bayside@pay.test", numberPrefix: "BL", taxRateBps: 1500, paymentTermsDays: 15, footerText: "Thank you - Bayside Lawn & Snow" });
    expect(plan.columns.cancellation_policy_text).toBe("Bayside Lawn & Snow needs 24 hours notice to cancel.");
    expect(plan.previous.aiSections.sms_agent).toEqual({ enabled: false });
    expect(plan.previous.aiSections.collections).toBeNull();
    expect(plan.written.aiSections.sms_agent).toEqual({ enabled: true, autonomy: "ask_first" });
    expect(plan.changes).toEqual(expect.arrayContaining(["agent_persona.name", "ai_settings.sms_agent.enabled", "invoice_settings.paymentTermsDays", "cancellation_policy_text"]));
  });

  it("tuning mode copies no switches at any depth, and unattended applies copy no prose", () => {
    const rich = extractBlueprint({
      ...SOURCE,
      ai_settings: { ...SOURCE.ai_settings, call_answering: { mode: "voicemail" }, sms_agent: { enabled: true, autonomy: "off" }, marketing: { win_back: { enabled: true, months_min: 6 }, review_replies: { enabled: true } } },
      invoice_settings: { autoInvoiceOnComplete: "send", paymentTermsDays: 15, reminderMessage: "Friendly reminder that your invoice is due soon." },
    });
    const plan = planBlueprint(rich, { name: "New Co", agent_persona: {}, ai_settings: {} }, { ...OPTS, mode: "tuning", catalogKeys: ["salting"] });
    const all = JSON.stringify({ ai: plan.aiSections, cols: plan.columns });
    expect(all).not.toMatch(/"enabled"|"any_on"|"autonomy"|"mode":"voicemail"|autoInvoiceOnComplete/);
    expect(plan.aiSections.marketing).toEqual({ win_back: { months_min: 6 } });
    expect(plan.aiSections.dispatch).toEqual({ weather: { sensitive: ["salting"] } });
    expect(plan.columns.sales_call_settings).toEqual({ delayMinutes: 3 });
    expect(plan.aiSections.call_answering).toBeUndefined();
    expect((plan.columns.invoice_settings as Record<string, unknown>).reminderMessage).toBe("Friendly reminder that your invoice is due soon.");

    const unattended = planBlueprint(rich, { name: "New Co", agent_persona: {}, ai_settings: {} }, { ...OPTS, mode: "tuning", unattended: true });
    expect(unattended.columns.cancellation_policy_text).toBeUndefined();
    expect(unattended.columns.invoice_settings).toEqual({ paymentTermsDays: 15 });
  });

  it("doesn't replace the booking setup of a business that has bookings", () => {
    const plan = planBlueprint(content, { name: "Busy Co", agent_persona: {}, ai_settings: {} }, { ...OPTS, hasBookings: true });
    expect(plan.columns.booking_policy).toBeUndefined();
    expect(plan.skipped.join(" ")).toContain("booking_policy: the business already has bookings");
  });

  it("applying the same blueprint again changes nothing", () => {
    const target = { name: "New Co", agent_persona: {}, ai_settings: {}, brand_reply_phone: "416-555-0199", brand_reply_email: "a@b.ca" };
    const first = planBlueprint(content, target, OPTS);
    const after = { ...target, agent_persona: first.persona, ai_settings: first.aiSettingsNext, ...first.columns };
    expect(planBlueprint(content, after, OPTS).changes).toEqual([]);
  });
});

describe("the blueprint service", () => {
  function seed(): FakeDb {
    return createFakeDb({
      companies: [
        { ...SOURCE, updated_at: "2026-10-29T00:00:00Z" },
        { id: "co-new", organization_id: "org-new", name: "Bayside Lawn & Snow", agent_persona: {}, ai_settings: { sms_agent: { enabled: false } }, invoice_settings: { etransferEmail: "bayside@pay.test" }, booking_policy: null, cancellation_policy_text: null, brand_reply_phone: "416-555-0199", brand_reply_email: "hi@bayside.test", updated_at: "2026-10-29T00:00:00Z" },
      ],
      service_catalog_items: [{ organization_id: "org-new", company_id: "co-new", service_key: "salting" }],
      bookings: [],
      agent_blueprints: [],
      agent_blueprint_applications: [],
      voice_numbers: [],
    });
  }
  const target = { organizationId: "org-new", companyId: "co-new" };
  const src = { organizationId: "org-src", companyId: "co-src" };

  it("saves numbered versions, applies (dry run first), and reverts exactly what it touched", async () => {
    const db = seed();
    const v1 = await saveBlueprintFromCompany(db.client, { scope: src, name: "Snow pro", createdBy: "test" });
    const v2 = await saveBlueprintFromCompany(db.client, { scope: src, name: "Snow pro", createdBy: "test" });
    expect([v1.version, v2.version]).toEqual([1, 2]);
    expect(v1.pack_id).toBe("property-maintenance-snow");
    expect((await findBlueprint(db.client, { name: "Snow pro" }))?.version).toBe(2);

    const dry = await applyBlueprint(db.client, { blueprint: v2, target, mode: "full", appliedBy: "test", dryRun: true });
    expect(dry.applicationId).toBeNull();
    expect(dry.plan.changes.length).toBeGreaterThan(5);
    expect(db.tables.companies[1].ai_settings).toEqual({ sms_agent: { enabled: false } });

    const real = await applyBlueprint(db.client, { blueprint: v2, target, mode: "full", appliedBy: "test", dryRun: false });
    const co = db.tables.companies[1];
    expect(co.agent_persona).toEqual({ name: "Sam", tone: "casual" });
    expect((co.ai_settings as Record<string, unknown>).sms_agent).toEqual({ enabled: true, autonomy: "ask_first" });
    expect(co.invoice_settings).toMatchObject({ etransferEmail: "bayside@pay.test", paymentTermsDays: 15 });
    expect(co.booking_policy).toBeTruthy();
    expect(co.cancellation_policy_text).toBe("Bayside Lawn & Snow needs 24 hours notice to cancel.");
    expect(co.updated_at).not.toBe("2026-10-29T00:00:00Z");

    expect(await revertApplication(db.client, real.applicationId as string, "test")).toEqual({ reverted: true, leftAsIs: [] });
    expect(co.agent_persona).toEqual({});
    expect(co.ai_settings).toEqual({ sms_agent: { enabled: false } });
    expect(co.invoice_settings).toEqual({ etransferEmail: "bayside@pay.test" });
    expect(co.booking_policy).toBeNull(); // back to none, not {} (which would mean window booking)
    expect(co.cancellation_policy_text).toBeNull();
    expect(await revertApplication(db.client, real.applicationId as string, "test")).toEqual({ reverted: false, reason: "already reverted" });
  });

  it("revert leaves anything the owner changed since, and refuses while a newer apply stands", async () => {
    const db = seed();
    const bp = await saveBlueprintFromCompany(db.client, { scope: src, name: "Snow pro", createdBy: "test" });
    const first = await applyBlueprint(db.client, { blueprint: bp, target, mode: "full", appliedBy: "test", dryRun: false });
    const co = db.tables.companies[1];
    (co.ai_settings as Record<string, unknown>).sms_agent = { enabled: false, autonomy: "ask_first" }; // owner paused texts since
    db.tables.agent_blueprint_applications[0].applied_at = "2026-10-29T01:00:00Z";
    db.tables.agent_blueprint_applications.push({ id: "app-newer", organization_id: "org-new", company_id: "co-new", reverted_at: null, applied_at: "2026-10-29T02:00:00Z", previous: {} });
    expect((await revertApplication(db.client, first.applicationId as string, "test")).reason).toContain("revert that one first");
    db.tables.agent_blueprint_applications.pop();
    const r = await revertApplication(db.client, first.applicationId as string, "test");
    expect(r.reverted).toBe(true);
    expect(r.leftAsIs).toEqual(["ai_settings.sms_agent"]);
    expect((co.ai_settings as Record<string, unknown>).sms_agent).toEqual({ enabled: false, autonomy: "ask_first" });
    expect((co.ai_settings as Record<string, unknown>).collections).toBeUndefined();
  });

  it("a change made at the same moment isn't overwritten (the apply re-plans on the fresh row)", async () => {
    const db = seed();
    const bp = await saveBlueprintFromCompany(db.client, { scope: src, name: "Snow pro", createdBy: "test" });
    const raw: { from: (t: string) => Record<string, unknown> } = db.client;
    const realFrom = raw.from.bind(raw);
    let raced = false;
    raw.from = (table: string) => {
      const builder = realFrom(table);
      if (table !== "companies" || raced) return builder;
      const update = builder.update as (row: Record<string, unknown>) => unknown;
      builder.update = (row: Record<string, unknown>) => {
        if (!raced) {
          raced = true; // the owner pauses texts between our read and our write
          const co = db.tables.companies[1];
          co.ai_settings = { ...(co.ai_settings as Record<string, unknown>), owner_pause: { at: "now" } };
          co.updated_at = "2026-10-29T00:00:05Z";
        }
        return update(row);
      };
      return builder;
    };
    await applyBlueprint(db.client, { blueprint: bp, target, mode: "full", appliedBy: "test", dryRun: false });
    expect((db.tables.companies[1].ai_settings as Record<string, unknown>).owner_pause).toEqual({ at: "now" });
    expect((db.tables.companies[1].ai_settings as Record<string, unknown>).collections).toBeDefined();
  });

  it("if the application can't be recorded, the change is rolled back", async () => {
    const db = seed();
    const bp = await saveBlueprintFromCompany(db.client, { scope: src, name: "Snow pro", createdBy: "test" });
    db.failNext("agent_blueprint_applications", "insert", { message: "down" });
    await expect(applyBlueprint(db.client, { blueprint: bp, target, mode: "full", appliedBy: "test", dryRun: false })).rejects.toBeTruthy();
    expect(db.tables.companies[1].ai_settings).toEqual({ sms_agent: { enabled: false } });
    expect(db.tables.companies[1].agent_persona).toEqual({});
    expect(db.tables.companies[1].booking_policy).toBeNull();
  });

  it("a new tenant gets its pack's default: tuning, unattended; no default → nothing", async () => {
    const db = seed();
    expect(await applyDefaultBlueprintForPack(db.client, { scope: target, packId: "property-maintenance-snow", appliedBy: "test" })).toEqual({ applied: false, reason: "no default blueprint for this pack" });
    const bp = await saveBlueprintFromCompany(db.client, { scope: src, name: "Snow pro", createdBy: "test" });
    await setDefaultForPack(db.client, bp.id);
    const r = await applyDefaultBlueprintForPack(db.client, { scope: target, packId: "property-maintenance-snow", appliedBy: "test" });
    expect(r).toMatchObject({ applied: true, blueprint: "Snow pro v1" });
    const ai = db.tables.companies[1].ai_settings as Record<string, unknown>;
    expect(ai.sms_agent).toEqual({ enabled: false }); // the switch and autonomy stay the plan's
    expect(JSON.stringify(ai)).not.toContain('"enabled":true');
    expect(db.tables.companies[1].cancellation_policy_text).toBeNull(); // prose isn't copied unattended
    expect(db.tables.agent_blueprint_applications[0].mode).toBe("tuning");
    expect(await applyDefaultBlueprintForPack(db.client, { scope: target, packId: null, appliedBy: "test" })).toEqual({ applied: false, reason: "no pack" });
  });

  it("the job: arguments and a dry-run apply", async () => {
    expect(parseBlueprintArgs(["apply", "--name", "Snow pro", "--company", "co-new", "--mode", "tuning", "--apply"])).toMatchObject({ command: "apply", name: "Snow pro", company: "co-new", mode: "tuning", apply: true });
    expect(parseBlueprintArgs(["--name", "x", "show"]).command).toBe("show");
    expect(parseBlueprintArgs([]).command).toBe("list");
    const db = seed();
    await saveBlueprintFromCompany(db.client, { scope: src, name: "Snow pro", createdBy: "test" });
    const lines: string[] = [];
    expect(await runBlueprintJob(db.client, parseBlueprintArgs(["apply", "--name", "Snow pro", "--company", "co-new"]), (l) => lines.push(l))).toBe(0);
    expect(lines[0]).toMatch(/^Would apply Snow pro v1 to Bayside Lawn & Snow \(full\): \d+ change\(s\)$/);
    expect(lines.at(-1)).toBe("(dry run — pass --apply to write it)");
    expect(db.tables.agent_blueprint_applications).toHaveLength(0);
  });
});
