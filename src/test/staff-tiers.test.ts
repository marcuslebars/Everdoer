import { afterEach, describe, expect, it, vi } from "vitest";
import { STAFF_DEFAULT_TIER, orgTier, staffDefaultOn, staffTierGatingOn, tierOf, type StaffFeature, type StaffOrg } from "@/server/services/staff/tiers";
import { readEstimatorSettings } from "@/server/services/staff/estimator/settings";
import { readMarketingSettings } from "@/server/services/staff/marketer/settings";
import { dispatcherAnyOn, readDispatchSettings } from "@/server/services/staff/dispatcher/settings";
import { loadActiveCompanies, loadCollectionsSettings, readCollectionsSettings } from "@/server/services/staff/bookkeeper/settings";
import { readOfficeManagerSettings } from "@/server/services/staff/office-manager/settings";
import { readRecruiterSettings } from "@/server/services/staff/recruiter/settings";
import { createFakeDb } from "@/test/helpers/fake-supabase";

const dfy = (tier: string | null): StaffOrg => ({ doneForYou: true, tier });
const HOUSE: StaffOrg = { doneForYou: false, tier: null };
const FEATURES = Object.keys(STAFF_DEFAULT_TIER) as StaffFeature[];

afterEach(() => vi.unstubAllEnvs());

describe("staffDefaultOn", () => {
  it("gating off (the default): every role on for done-for-you, off for house orgs — as before", () => {
    vi.stubEnv("STAFF_TIER_GATING", "");
    expect(staffTierGatingOn()).toBe(false);
    for (const f of FEATURES) {
      expect(staffDefaultOn(f, dfy("catch"))).toBe(true);
      expect(staffDefaultOn(f, dfy(null))).toBe(true);
      expect(staffDefaultOn(f, HOUSE)).toBe(false);
    }
  });

  it("gating on: Catch gets the briefing and the import only", () => {
    vi.stubEnv("STAFF_TIER_GATING", "1");
    const on = FEATURES.filter((f) => staffDefaultOn(f, dfy("catch")));
    expect(on.sort()).toEqual(["importer", "office_manager"]);
  });

  it("gating on: Close adds the money, quotes, reviews and after-job check-ins", () => {
    vi.stubEnv("STAFF_TIER_GATING", "true");
    const on = FEATURES.filter((f) => staffDefaultOn(f, dfy("close")));
    expect(on.sort()).toEqual(["bookkeeper", "customer_care", "estimator", "estimator.follow_ups", "importer", "marketer.review_replies", "office_manager"]);
  });

  it("gating on: Front Desk adds the Dispatcher and the Tax Clerk; opt-in roles stay off on every tier", () => {
    vi.stubEnv("STAFF_TIER_GATING", "1");
    const on = FEATURES.filter((f) => staffDefaultOn(f, dfy("front_desk")));
    expect(on).toContain("dispatcher");
    expect(on).toContain("tax_clerk");
    const optIn = FEATURES.filter((f) => STAFF_DEFAULT_TIER[f] === null);
    expect(optIn.length).toBeGreaterThan(0);
    for (const f of optIn) for (const t of ["catch", "close", "front_desk"]) expect(staffDefaultOn(f, dfy(t))).toBe(false);
  });

  it("gating on: a done-for-you org with no (or an unknown) tier is grandfathered — everything on; house orgs still off", () => {
    vi.stubEnv("STAFF_TIER_GATING", "1");
    for (const f of FEATURES) {
      expect(staffDefaultOn(f, dfy(null))).toBe(true);
      expect(staffDefaultOn(f, dfy("platinum"))).toBe(true);
      expect(staffDefaultOn(f, { doneForYou: false, tier: "front_desk" })).toBe(false);
    }
  });

  it("tiers only go up: anything on in a lower tier is on in every higher one", () => {
    vi.stubEnv("STAFF_TIER_GATING", "1");
    for (const f of FEATURES) {
      if (staffDefaultOn(f, dfy("catch"))) expect(staffDefaultOn(f, dfy("close"))).toBe(true);
      if (staffDefaultOn(f, dfy("close"))) expect(staffDefaultOn(f, dfy("front_desk"))).toBe(true);
    }
  });

  it("tierOf / orgTier accept only real tiers", () => {
    expect(tierOf("close")).toBe("close");
    expect(tierOf("CLOSE")).toBeNull();
    expect(tierOf(3)).toBeNull();
    expect(orgTier({ crankleads_tier: "front_desk", platform_brand: "crankleads" })).toBe("front_desk");
    expect(orgTier({ platform_brand: "crankleads" })).toBeNull();
    expect(orgTier(null)).toBeNull();
  });
});

describe("the role readers follow the tier (gating on)", () => {
  it("the Estimator: off by default on Catch, on from Close; the owner's switch still wins", () => {
    vi.stubEnv("STAFF_TIER_GATING", "1");
    expect(readEstimatorSettings({}, dfy("catch")).enabled).toBe(false);
    expect(readEstimatorSettings({}, dfy("close")).enabled).toBe(true);
    expect(readEstimatorSettings({ estimator: { enabled: true } }, dfy("catch")).enabled).toBe(true);
    expect(readEstimatorSettings({ estimator: { enabled: false } }, dfy("front_desk")).enabled).toBe(false);
  });

  it("the Marketer: review replies from Close; win-back and Google posts only when switched on", () => {
    vi.stubEnv("STAFF_TIER_GATING", "1");
    const close = readMarketingSettings({}, dfy("close"));
    expect(close.reviewReplies.enabled).toBe(true);
    expect(close.winBack.enabled).toBe(false);
    expect(close.googlePosts.enabled).toBe(false);
    expect(readMarketingSettings({ marketing: { win_back: { enabled: true } } }, dfy("catch")).winBack.enabled).toBe(true);
  });

  it("the Dispatcher: Front Desk only", () => {
    vi.stubEnv("STAFF_TIER_GATING", "1");
    expect(dispatcherAnyOn(readDispatchSettings({}, { ...dfy("close"), hints: ["Northshore Roofing"] }))).toBe(false);
    expect(dispatcherAnyOn(readDispatchSettings({}, { ...dfy("front_desk"), hints: ["Northshore Roofing"] }))).toBe(true);
  });

  it("the briefing is on in every tier; the Recruiter is opt-in", () => {
    vi.stubEnv("STAFF_TIER_GATING", "1");
    expect(readOfficeManagerSettings({}, dfy("catch")).enabled).toBe(true);
    const r = readRecruiterSettings({}, dfy("front_desk"));
    expect(r.payroll.enabled || r.hiring.enabled || r.defaultEnabled).toBe(false);
  });

  it("gating off: the same readers give today's defaults", () => {
    expect(readEstimatorSettings({}, dfy("catch")).enabled).toBe(true);
    expect(readMarketingSettings({}, dfy("catch")).winBack.enabled).toBe(true);
    expect(readCollectionsSettings({}, dfy("catch")).enabled).toBe(true);
  });
});

describe("the loaders read the tier off the organization", () => {
  const ORG_CATCH = "00000000-0000-4000-8000-0000000000c1";
  const ORG_CLOSE = "00000000-0000-4000-8000-0000000000c2";
  const ORG_OLD = "00000000-0000-4000-8000-0000000000c3";
  const CO_CATCH = "00000000-0000-4000-8000-0000000000d1";
  const CO_CLOSE = "00000000-0000-4000-8000-0000000000d2";
  const CO_OLD = "00000000-0000-4000-8000-0000000000d3";
  const seed = () =>
    createFakeDb({
      organizations: [
        { id: ORG_CATCH, platform_brand: "crankleads", crankleads_tier: "catch" },
        { id: ORG_CLOSE, platform_brand: "crankleads", crankleads_tier: "close" },
        { id: ORG_OLD, platform_brand: "crankleads", crankleads_tier: null },
      ],
      companies: [
        { id: CO_CATCH, organization_id: ORG_CATCH, timezone: "America/Toronto", ai_settings: {} },
        { id: CO_CLOSE, organization_id: ORG_CLOSE, timezone: "America/Toronto", ai_settings: {} },
        { id: CO_OLD, organization_id: ORG_OLD, timezone: "America/Toronto", ai_settings: {} },
      ],
    });

  it("one company: the Bookkeeper is off by default on Catch, on for Close and for a grandfathered org", async () => {
    vi.stubEnv("STAFF_TIER_GATING", "1");
    const db = seed();
    const admin = db.client;
    expect((await loadCollectionsSettings(admin, ORG_CATCH, CO_CATCH))?.enabled).toBe(false);
    expect((await loadCollectionsSettings(admin, ORG_CLOSE, CO_CLOSE))?.enabled).toBe(true);
    expect((await loadCollectionsSettings(admin, ORG_OLD, CO_OLD))?.enabled).toBe(true);
  });

  it("the sweep: only the companies whose tier includes the Bookkeeper, each carrying its tier", async () => {
    vi.stubEnv("STAFF_TIER_GATING", "1");
    const db = seed();
    const active = await loadActiveCompanies(db.client);
    expect(active.map((c) => [c.companyId, c.tier]).sort()).toEqual([
      [CO_CLOSE, "close"],
      [CO_OLD, null],
    ].sort());
  });

  it("gating off: the sweep is everyone, as before", async () => {
    const db = seed();
    const active = await loadActiveCompanies(db.client);
    expect(active.map((c) => c.companyId).sort()).toEqual([CO_CATCH, CO_CLOSE, CO_OLD].sort());
  });
});
