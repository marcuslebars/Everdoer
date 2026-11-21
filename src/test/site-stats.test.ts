import { afterEach, describe, expect, it, vi } from "vitest";

import { createFakeDb, type FakeDb } from "@/test/helpers/fake-supabase";

/**
 * Site stats (docs/done-for-you.md → "Generated sites" → "Site stats"): visits and call taps from
 * the page beacon, quote requests from the public form, and the owner's 30-day summary.
 */
let db: FakeDb;
let user: { id: string } | null = null;
vi.mock("@/server/supabase/admin", () => ({ createSupabaseAdminClient: () => db.client }));
vi.mock("@/server/supabase/server", () => ({
  createSupabaseServerClient: () => ({
    ...(db.client as unknown as Record<string, unknown>),
    from: (table: string) => (db.client as unknown as { from: (t: string) => unknown }).from(table),
    rpc: (db.client as unknown as { rpc: unknown }).rpc,
    auth: {
      async getUser() {
        return user ? { data: { user }, error: null } : { data: { user: null }, error: { message: "no session" } };
      },
    },
  }),
}));

import { POST as hitPOST } from "@/app/api/public/sites/hit/route";
import { GET as statsGET } from "@/app/api/organizations/[organizationId]/companies/[companyId]/site/stats/route";
import { snowCompany } from "@/server/services/dfy/__fixtures__/sample-sites";
import {
  buildSiteFacts,
  defaultSitePagesSettings,
  factsUsed,
  parseSiteSections,
  SITE_CONTENT_VERSION,
  templateSiteCopy,
  type SiteContent,
} from "@/server/services/dfy/site-content";
import { sitePages } from "@/server/services/dfy/site-pages";
import { renderSitePage, renderSiteSubpage } from "@/server/services/dfy/site-render";
import {
  isBotUserAgent,
  recordSiteHit,
  recordSiteQuote,
  siteLocalDay,
  sitePathFromPageUrl,
  siteTrafficSource,
  summarizeSiteStats,
} from "@/server/services/dfy/site-stats";

const ORG = "org-1";
const CO = "c1";
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1";

function content(): SiteContent {
  const facts = buildSiteFacts(snowCompany);
  return {
    version: SITE_CONTENT_VERSION,
    mode: "full",
    facts,
    factsUsed: factsUsed(facts),
    copy: templateSiteCopy(facts, "full"),
    copySource: "template",
    copyNotes: [],
    edits: {},
    settings: { showPrices: true, stockPhoto: true, theme: "auto", color: null, sections: parseSiteSections(null), pages: defaultSitePagesSettings() },
    copyNote: null,
    stockPhoto: null,
    generatedAt: "2026-11-21T12:00:00.000Z",
  };
}

interface Bump {
  p_site: string;
  p_day: string;
  p_path: string;
  p_source: string;
  p_views: number;
  p_calls: number;
  p_quotes: number;
}

function seed(site: Record<string, unknown> = {}, limitTrips = false) {
  db = createFakeDb({
    organization_memberships: [{ id: "m1", organization_id: ORG, profile_id: "u1", role: "member" }],
    profiles: [{ id: "u1", email: "o@example.com" }],
    organizations: [{ id: ORG, platform_brand: "everdoer", subscription_status: "active" }],
    companies: [{ id: CO, organization_id: ORG, name: "Northshore", timezone: "America/Toronto" }],
    company_sites: [
      {
        id: "site-1",
        organization_id: ORG,
        company_id: CO,
        slug: "northshore-snow",
        status: "published",
        content: content(),
        custom_domain: "www.acme.ca",
        custom_domain_status: "active",
        ...site,
      },
    ],
    site_stats_daily: [],
  });
  const bumps: Bump[] = [];
  db.onRpc((name, args) => {
    if (name === "consume_rate_limit") return { data: !limitTrips, error: null };
    if (name === "site_stats_bump") bumps.push(args as unknown as Bump);
    return { data: null, error: null };
  });
  user = { id: "u1" };
  return bumps;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("pure helpers", () => {
  it("buckets traffic the way an owner thinks about it", () => {
    expect(siteTrafficSource({ referrer: "https://www.google.ca/" })).toBe("google");
    expect(siteTrafficSource({ referrer: "https://www.bing.com/search?q=x" })).toBe("bing");
    expect(siteTrafficSource({ referrer: "https://m.facebook.com/" })).toBe("facebook");
    expect(siteTrafficSource({ referrer: "https://l.instagram.com/" })).toBe("instagram");
    expect(siteTrafficSource({ referrer: "https://kijiji.ca/x" })).toBe("other");
    expect(siteTrafficSource({ referrer: "" })).toBe("direct");
    expect(siteTrafficSource({ referrer: "https://acme.ca/", ownHosts: ["www.acme.ca"] })).toBe("direct");
    expect(siteTrafficSource({ referrer: "https://www.google.com/", adClick: true })).toBe("ads");
    expect(siteTrafficSource({ utmSource: "facebook", utmMedium: "paid_social" })).toBe("ads");
    expect(siteTrafficSource({ utmSource: "fb" })).toBe("facebook");
    expect(siteTrafficSource({ utmSource: "newsletter", referrer: "https://google.com" })).toBe("other");
  });

  it("drops bots and link previewers", () => {
    expect(isBotUserAgent(UA)).toBe(false);
    for (const ua of [null, "", "Googlebot/2.1", "facebookexternalhit/1.1", "curl/8.0", "Mozilla/5.0 HeadlessChrome/120"]) expect(isBotUserAgent(ua)).toBe(true);
  });

  it("days are the business's days", () => {
    // 03:00 UTC on the 21st is still the 20th in Toronto.
    expect(siteLocalDay(new Date("2026-11-21T03:00:00Z"), "America/Toronto")).toBe("2026-11-20");
    expect(siteLocalDay(new Date("2026-11-21T03:00:00Z"), "Europe/London")).toBe("2026-11-21");
    expect(siteLocalDay(new Date("2026-11-21T03:00:00Z"), "Not/AZone")).toBe("2026-11-20");
  });

  it("knows which site page a quote came from", () => {
    const site = { slug: "northshore-snow", custom_domain: "www.acme.ca", custom_domain_status: "active" };
    expect(sitePathFromPageUrl(site, "https://pages.everdoer.com/northshore-snow")).toBe("");
    expect(sitePathFromPageUrl(site, "https://pages.everdoer.com/northshore-snow/roof-snow-removal?utm_source=x")).toBe("roof-snow-removal");
    expect(sitePathFromPageUrl(site, "https://app.everdoer.com/s/northshore-snow/")).toBe("");
    expect(sitePathFromPageUrl(site, "https://www.acme.ca/snow-removal-barrie")).toBe("snow-removal-barrie");
    expect(sitePathFromPageUrl(site, "https://acme.ca/f/key")).toBeNull();
    expect(sitePathFromPageUrl(site, "https://other.ca/northshore-snowy")).toBeNull();
    expect(sitePathFromPageUrl({ ...site, custom_domain_status: "pending" }, "https://www.acme.ca/")).toBeNull();
    expect(sitePathFromPageUrl(site, "not a url")).toBeNull();
  });

  it("summarises 30 days against the 30 before, zero-filled, sources and pages ranked", () => {
    const rows = [
      { day: "2026-11-21", path: "", source: "google", views: 5, calls: 2, quotes: 1 },
      { day: "2026-11-20", path: "roof", source: "direct", views: 3, calls: 0, quotes: 2 },
      { day: "2026-11-20", path: "", source: "facebook", views: 1, calls: 0, quotes: 0 },
      { day: "2026-10-10", path: "", source: "google", views: 4, calls: 1, quotes: 0 },
      { day: "2026-08-01", path: "", source: "google", views: 99, calls: 9, quotes: 9 },
    ];
    const s = summarizeSiteStats(rows, "2026-11-21", 30);
    expect(s.totals).toEqual({ views: 9, calls: 2, quotes: 3 });
    expect(s.previous).toEqual({ views: 4, calls: 1, quotes: 0 });
    expect(s.daily).toHaveLength(30);
    expect(s.daily[0].day).toBe("2026-10-23");
    expect(s.daily.at(-1)).toEqual({ day: "2026-11-21", views: 5, calls: 2, quotes: 1 });
    expect(s.sources.map((x) => [x.source, x.views])).toEqual([
      ["google", 5],
      ["direct", 3],
      ["facebook", 1],
    ]);
    expect(s.pages[0]).toMatchObject({ path: "", views: 6 });
  });
});

describe("the page's counting script", () => {
  const opts = { url: "https://pages.everdoer.com/northshore-snow", formKey: "evpk_0123456789abcdef0123456789abcdef", bookingUrl: null, turnstileSiteKey: null, creditUrl: null };
  const stats = { endpoint: "https://app.everdoer.com/api/public/sites/hit", slug: "northshore-snow" };

  it("is on published pages with the page's own path, never in the preview", () => {
    const home = renderSitePage(content(), { ...opts, stats });
    expect(home).toContain('"u":"https://app.everdoer.com/api/public/sites/hit"');
    expect(home).toContain('"s":"northshore-snow","p":""');
    const page = sitePages(content())[0];
    expect(renderSiteSubpage(content(), { ...opts, stats }, page)).toContain(`"p":"${page.path}"`);
    expect(renderSitePage(content(), { ...opts, stats, preview: true })).not.toContain("sendBeacon");
    expect(renderSitePage(content(), opts)).not.toContain("sendBeacon");
  });

  it("can't be broken out of by a hostile slug or endpoint", () => {
    const html = renderSitePage(content(), { ...opts, stats: { endpoint: "https://app.everdoer.com/x", slug: "</script><script>alert(1)" } });
    expect(html).not.toContain("</script><script>alert(1)");
    expect(renderSitePage(content(), { ...opts, stats: { endpoint: "javascript:alert(1)", slug: "a" } })).not.toContain("sendBeacon");
  });
});

describe("recording", () => {
  it("a visit and a call tap on a published site's real pages, in the business's day", async () => {
    const bumps = seed();
    const now = new Date("2026-11-21T03:00:00Z");
    expect(await recordSiteHit({ slug: "northshore-snow", path: "", kind: "view", referrer: "https://www.google.ca/" }, undefined, now)).toBe(true);
    const page = sitePages(content())[0];
    expect(await recordSiteHit({ slug: "NORTHSHORE-SNOW", path: page.path, kind: "call", referrer: "https://www.acme.ca/" }, undefined, now)).toBe(true);
    expect(bumps).toEqual([
      { p_site: "site-1", p_day: "2026-11-20", p_path: "", p_source: "google", p_views: 1, p_calls: 0, p_quotes: 0 },
      { p_site: "site-1", p_day: "2026-11-20", p_path: page.path, p_source: "direct", p_views: 0, p_calls: 1, p_quotes: 0 },
    ]);
  });

  it("ignores unknown sites, unknown pages and unpublished sites", async () => {
    let bumps = seed();
    expect(await recordSiteHit({ slug: "nope", path: "", kind: "view" })).toBe(false);
    expect(await recordSiteHit({ slug: "northshore-snow", path: "not-a-page", kind: "view" })).toBe(false);
    expect(await recordSiteHit({ slug: "../x", path: "", kind: "view" })).toBe(false);
    expect(bumps).toHaveLength(0);
    bumps = seed({ status: "draft" });
    expect(await recordSiteHit({ slug: "northshore-snow", path: "", kind: "view" })).toBe(false);
    expect(bumps).toHaveLength(0);
  });

  it("quote requests count only when they came from the site (any of its addresses)", async () => {
    const bumps = seed();
    const base = { organizationId: ORG, companyId: CO };
    expect(await recordSiteQuote({ ...base, pageUrl: "https://www.acme.ca/snow-removal-barrie", utm: { utm_source: "google", utm_medium: "cpc" } })).toBe(true);
    expect(await recordSiteQuote({ ...base, pageUrl: "https://pages.everdoer.com/northshore-snow" })).toBe(true);
    expect(await recordSiteQuote({ ...base, pageUrl: "https://acme-old-site.ca/contact" })).toBe(false);
    expect(await recordSiteQuote({ ...base, pageUrl: null })).toBe(false);
    expect(bumps.map((b) => [b.p_path, b.p_source, b.p_quotes])).toEqual([
      ["snow-removal-barrie", "ads", 1],
      ["", "unknown", 1],
    ]);
  });

  it("a stats failure never throws into the lead", async () => {
    seed();
    db.onRpc(() => ({ data: null, error: { message: "db down" } }));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(recordSiteQuote({ organizationId: ORG, companyId: CO, pageUrl: "https://www.acme.ca/" })).resolves.toBe(false);
  });
});

describe("routes", () => {
  const beacon = (body: unknown, ua: string | null = UA) =>
    new Request("http://t/api/public/sites/hit", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers: { "content-type": "text/plain", ...(ua ? { "user-agent": ua } : {}) } });

  it("the beacon always answers 204, and counts only real visits", async () => {
    const bumps = seed();
    let res = await hitPOST(beacon({ s: "northshore-snow", p: "", k: "view", r: "https://www.google.ca/" }));
    expect(res.status).toBe(204);
    expect(bumps).toHaveLength(1);
    for (const bad of [beacon({ s: "northshore-snow", k: "view" }, "Googlebot/2.1"), beacon("not json"), beacon({ s: "northshore-snow", k: "purchase" }), beacon("x".repeat(3000))]) {
      res = await hitPOST(bad);
      expect(res.status).toBe(204);
    }
    expect(bumps).toHaveLength(1);
  });

  it("the beacon stops counting when the rate limit trips", async () => {
    const bumps = seed({}, true);
    expect((await hitPOST(beacon({ s: "northshore-snow", p: "", k: "view" }))).status).toBe(204);
    expect(bumps).toHaveLength(0);
  });

  it("members read their own site's summary", async () => {
    seed();
    db.tables.site_stats_daily.push(
      { site_id: "site-1", organization_id: ORG, company_id: CO, day: siteLocalDay(new Date(), "America/Toronto"), path: "", source: "google", views: 4, calls: 1, quotes: 1 },
      { site_id: "other", organization_id: ORG, company_id: "c2", day: siteLocalDay(new Date(), "America/Toronto"), path: "", source: "google", views: 50, calls: 0, quotes: 0 },
    );
    const res = await statsGET(new Request("http://t/x"), { params: { organizationId: ORG, companyId: CO } });
    expect(res.status).toBe(200);
    const data = (await res.json()).data;
    expect(data).toMatchObject({ published: true, days: 30, totals: { views: 4, calls: 1, quotes: 1 } });
    expect(data.pages[0]).toMatchObject({ path: "", label: "Home page" });

    user = null;
    expect((await statsGET(new Request("http://t/x"), { params: { organizationId: ORG, companyId: CO } })).status).toBe(401);
  });
});
