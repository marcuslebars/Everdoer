import { afterEach, describe, expect, it, vi } from "vitest";

import { createFakeDb, type FakeDb } from "@/test/helpers/fake-supabase";

/**
 * Stock photo at the top of a page without the owner's photos (Unsplash): the lookup, when the
 * generator picks one, how the page uses and credits it, and the owner's controls.
 */
let db: FakeDb;
let user: { id: string } | null = null;
vi.mock("@/server/services/usage", () => ({ recordAiUsageSafe: vi.fn(async () => undefined) }));
vi.mock("@/server/supabase/admin", () => ({ createSupabaseAdminClient: () => db.client }));
vi.mock("@/server/supabase/server", () => ({
  createSupabaseServerClient: () => ({
    ...(db.client as unknown as Record<string, unknown>),
    from: (table: string) => (db.client as unknown as { from: (t: string) => unknown }).from(table),
    auth: {
      async getUser() {
        return user ? { data: { user }, error: null } : { data: { user: null }, error: { message: "no session" } };
      },
    },
  }),
}));

const stockMock = vi.hoisted(() => ({ fn: null as null | ((input: { tradeId: string | null; seed: string; index?: number }) => Promise<unknown>) }));
vi.mock("@/server/services/dfy/site-stock", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/server/services/dfy/site-stock")>();
  return { ...real, findStockPhoto: (input: { tradeId: string | null; seed: string; index?: number }) => (stockMock.fn ? stockMock.fn(input) : real.findStockPhoto(input)) };
});

import { PATCH, POST } from "@/app/api/organizations/[organizationId]/companies/[companyId]/site/route";
import { snowCompany } from "@/server/services/dfy/__fixtures__/sample-sites";
import {
  buildSiteFacts,
  defaultSitePagesSettings,
  factsUsed,
  heroPhoto,
  parseSiteContent,
  parseSiteSections,
  SITE_CONTENT_VERSION,
  templateSiteCopy,
  type SiteContent,
  type SiteStockPhoto,
} from "@/server/services/dfy/site-content";
import { generateSite, type SiteGeneratorDeps } from "@/server/services/dfy/site-generator";
import { sitePages } from "@/server/services/dfy/site-pages";
import { buildJsonLd, renderSitePage, renderSiteSubpage } from "@/server/services/dfy/site-render";
import { findStockPhoto, stockQuery, toStockPhoto, type StockFetch } from "@/server/services/dfy/site-stock";

const ORG = "org-1";
const CO = "c1";

function unsplashPhoto(id: string, patch: Record<string, unknown> = {}) {
  return {
    id,
    width: 6000,
    height: 4000,
    alt_description: `Plow ${id}`,
    urls: { raw: `https://images.unsplash.com/photo-${id}?ixid=abc` },
    links: { html: `https://unsplash.com/photos/${id}`, download_location: `https://api.unsplash.com/photos/${id}/download?ixid=abc` },
    user: { name: `Pat ${id}`, username: `pat${id}`, links: { html: `https://unsplash.com/@pat${id}` } },
    ...patch,
  };
}

const STOCK: SiteStockPhoto = {
  id: "seven",
  url: "https://images.unsplash.com/photo-seven?ixid=abc&w=1920&q=80&fm=jpg&fit=crop",
  alt: "Snowy driveway",
  photographer: "Pat <Seven>",
  photographerUrl: "https://unsplash.com/@pat7?utm_source=everdoer&utm_medium=referral",
  pageUrl: "https://unsplash.com/photos/seven?utm_source=everdoer&utm_medium=referral",
  query: stockQuery("property-maintenance-snow"),
  index: 0,
};

function content(patch: Partial<SiteContent> = {}, photos: string[] = []): SiteContent {
  const facts = { ...buildSiteFacts(snowCompany), photos };
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
    stockPhoto: STOCK,
    generatedAt: "2026-11-21T12:00:00.000Z",
    ...patch,
  };
}

const opts = { url: "https://pages.everdoer.com/northshore", formKey: "evpk_0123456789abcdef0123456789abcdef", bookingUrl: null, turnstileSiteKey: null, creditUrl: null };

afterEach(() => {
  stockMock.fn = null;
  vi.unstubAllEnvs();
});

describe("Unsplash lookup", () => {
  it("a search per trade, with a fallback", () => {
    expect(stockQuery("property-maintenance-snow")).toContain("snow");
    expect(stockQuery("roofing")).toContain("roof");
    expect(stockQuery(null)).toBe(stockQuery("not-a-trade"));
  });

  it("only usable landscape photos from Unsplash's own hosts, hotlinked at hero size, links tagged", () => {
    const p = toStockPhoto(unsplashPhoto("a1"), "q", 0)!;
    expect(p).toMatchObject({ id: "a1", photographer: "Pat a1", alt: "Plow a1" });
    expect(p.url).toBe("https://images.unsplash.com/photo-a1?ixid=abc&w=1920&q=80&fm=jpg&fit=crop");
    expect(p.photographerUrl).toBe("https://unsplash.com/@pata1?utm_source=everdoer&utm_medium=referral");
    expect(p.pageUrl).toBe("https://unsplash.com/photos/a1?utm_source=everdoer&utm_medium=referral");
    expect(p.downloadLocation).toBe("https://api.unsplash.com/photos/a1/download?ixid=abc");
    expect(toStockPhoto(unsplashPhoto("a2", { urls: { raw: "https://evil.example/x.jpg" } }), "q", 0)).toBeNull();
    expect(toStockPhoto(unsplashPhoto("a3", { width: 1000, height: 3000 }), "q", 0)).toBeNull();
    expect(toStockPhoto(unsplashPhoto("a4", { user: { name: "X", links: { html: "javascript:alert(1)" } } }), "q", 0)?.photographerUrl).toBe("https://unsplash.com/photos/a4?utm_source=everdoer&utm_medium=referral");
    expect(toStockPhoto(unsplashPhoto("a5", { links: { html: "https://unsplash.com/photos/a5", download_location: "https://evil.example/ping" } }), "q", 0)?.downloadLocation).toBeNull();
    expect(toStockPhoto(unsplashPhoto("bad id!"), "q", 0)).toBeNull();
  });

  it("no key → no request; with a key: authorised search, a seeded pick reported as used, 'another' moves on and wraps", async () => {
    const fetch = vi.fn<StockFetch>(async (url) =>
      url.includes("/download") ? { ok: true, status: 200, json: async () => ({}) } : { ok: true, status: 200, json: async () => ({ results: [unsplashPhoto("p1"), unsplashPhoto("p2"), unsplashPhoto("p3")] }) },
    );
    expect(await findStockPhoto({ tradeId: "roofing", seed: "c1", apiKey: null, fetch })).toBeNull();
    expect(fetch).not.toHaveBeenCalled();

    const first = await findStockPhoto({ tradeId: "roofing", seed: "c1", apiKey: "k", fetch });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toContain("https://api.unsplash.com/search/photos?");
    expect(url).toContain("orientation=landscape");
    expect(url).toContain("content_filter=high");
    expect(decodeURIComponent(url.replace(/\+/g, " "))).toContain(stockQuery("roofing"));
    expect(init.headers.authorization).toBe("Client-ID k");
    // The picked photo is reported to its download_location.
    expect(fetch.mock.calls[1][0]).toBe(`https://api.unsplash.com/photos/${first!.id}/download?ixid=abc`);
    expect(first).not.toHaveProperty("downloadLocation");
    const ids = [first!.id];
    for (const index of [1, 2, 3]) ids.push((await findStockPhoto({ tradeId: "roofing", seed: "c1", index, apiKey: "k", fetch }))!.id);
    expect(new Set(ids.slice(0, 3)).size).toBe(3);
    expect(ids[3]).toBe(ids[0]);
  });

  it("an Unsplash failure is just 'no photo'; a failed download report still keeps the photo", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(await findStockPhoto({ tradeId: null, seed: "x", apiKey: "k", fetch: async () => ({ ok: false, status: 403, json: async () => ({}) }) })).toBeNull();
    expect(await findStockPhoto({ tradeId: null, seed: "x", apiKey: "k", fetch: async () => { throw new Error("offline"); } })).toBeNull();
    expect(await findStockPhoto({ tradeId: null, seed: "x", apiKey: "k", fetch: async () => ({ ok: true, status: 200, json: async () => ({ results: [] }) }) })).toBeNull();
    const flaky: StockFetch = async (url) => {
      if (url.includes("/download")) throw new Error("timeout");
      return { ok: true, status: 200, json: async () => ({ results: [unsplashPhoto("z1")] }) };
    };
    expect(await findStockPhoto({ tradeId: null, seed: "x", apiKey: "k", fetch: flaky })).toMatchObject({ id: "z1" });
  });
});

describe("on the page", () => {
  it("fills the top of the page and credits the photographer and Unsplash", () => {
    const html = renderSitePage(content(), opts);
    expect(heroPhoto(content())).toMatchObject({ stock: { id: "seven" } });
    expect(html).toContain(`src="${STOCK.url.replace(/&/g, "&amp;")}"`);
    expect(html).toContain("Top photo by");
    expect(html).toContain("Pat &lt;Seven&gt;");
    expect(html).toContain('href="https://unsplash.com/photos/seven?utm_source=everdoer&amp;utm_medium=referral"');
    expect(html).toContain(">Unsplash</a>");
  });

  it("is never 'Our work', never in the business data, and never on the extra pages", () => {
    const html = renderSitePage(content(), opts);
    expect(html).not.toContain('id="photos-title"');
    expect(JSON.stringify(buildJsonLd(content(), opts))).not.toContain("unsplash");
    const sub = renderSiteSubpage(content(), opts, sitePages(content())[0]);
    expect(sub).not.toContain("unsplash");
  });

  it("the owner's photo wins, and the owner can switch it off", () => {
    const own = renderSitePage(content({}, ["https://cdn.example/own.jpg"]), opts);
    expect(own).toContain("https://cdn.example/own.jpg");
    expect(own).not.toContain("unsplash");
    const off = renderSitePage(content({ settings: { ...content().settings, stockPhoto: false } }), opts);
    expect(off).not.toContain("unsplash");
  });

  it("a stored photo off Unsplash's hosts is dropped when read", () => {
    expect(parseSiteContent({ ...content(), stockPhoto: { ...STOCK, url: "https://evil.example/x.jpg" } })!.stockPhoto).toBeNull();
    expect(parseSiteContent({ ...content(), stockPhoto: undefined })!.stockPhoto).toBeNull();
  });
});

// ── Generator + routes ──────────────────────────────────────────────────────

function seed(companyPatch: Record<string, unknown> = {}) {
  db = createFakeDb(
    {
      organization_memberships: [{ id: "m1", organization_id: ORG, profile_id: "u1", role: "owner" }],
      profiles: [{ id: "u1", email: "o@example.com" }],
      organizations: [{ id: ORG, platform_brand: "everdoer", subscription_status: "active" }],
      companies: [
        {
          id: CO,
          organization_id: ORG,
          ...snowCompany.company,
          industry_pack: { id: "property-maintenance-snow", version: 1, appliedAt: "", recipes: [] },
          online_booking_settings: {},
          quote_public_base_url: null,
          ...companyPatch,
        },
      ],
      service_catalog_items: [],
      public_form_keys: [],
      company_sites: [],
    },
    { company_sites: [["slug"], ["company_id"]] },
  );
  user = { id: "u1" };
}

function deps(findStock: SiteGeneratorDeps["findStock"]): Partial<SiteGeneratorDeps> {
  return { writeCopy: null, findStock, now: () => new Date("2026-11-21T12:00:00Z") };
}

describe("generateSite", () => {
  it("picks one when the owner has no photos, keeps it on rebuild, and skips the lookup when they do", async () => {
    seed({ profile: { ...(snowCompany.company.profile as object), photos: [] } });
    const findStock = vi.fn(async () => STOCK);
    await generateSite(db.client, CO, { deps: deps(findStock) });
    expect(findStock).toHaveBeenCalledWith({ tradeId: "property-maintenance-snow", seed: CO });
    expect(parseSiteContent(db.tables.company_sites[0].content)!.stockPhoto).toMatchObject({ id: "seven" });
    await generateSite(db.client, CO, { deps: deps(findStock) });
    expect(findStock).toHaveBeenCalledTimes(1);

    seed({ profile: { ...(snowCompany.company.profile as object), photos: ["https://cdn.example/own.jpg"] } });
    const unused = vi.fn(async () => STOCK);
    await generateSite(db.client, CO, { deps: deps(unused) });
    expect(unused).not.toHaveBeenCalled();
  });

  it("an Unsplash outage never blocks the page", async () => {
    seed({ profile: { photos: [] } });
    const out = await generateSite(db.client, CO, { deps: deps(async () => { throw new Error("down"); }) });
    expect(parseSiteContent(out.site.content)!.stockPhoto).toBeNull();
  });
});

describe("owner controls", () => {
  const ctx = { params: { organizationId: ORG, companyId: CO } };
  const req = (method: string, body: unknown) => new Request("http://t/x", { method, body: JSON.stringify(body), headers: { "content-type": "application/json" } });

  it("'Show another' moves to the next photo; the switch turns it off; the view says whether it's set up", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("UNSPLASH_ACCESS_KEY", "k");
    seed({ profile: { photos: [] } });
    stockMock.fn = async (input) => ({ ...STOCK, id: `p${100 + (input.index ?? 0)}`, index: input.index ?? 0 });
    await POST(req("POST", { action: "generate" }), ctx);
    expect(parseSiteContent(db.tables.company_sites[0].content)!.stockPhoto).toMatchObject({ id: "p100" });

    let res = await POST(req("POST", { action: "stock-next" }), ctx);
    let site = (await res.json()).data.site;
    expect(site.stock).toMatchObject({ available: true, enabled: true, photo: { photographer: "Pat <Seven>" } });
    expect(parseSiteContent(db.tables.company_sites[0].content)!.stockPhoto).toMatchObject({ id: "p101", index: 1 });

    res = await PATCH(req("PATCH", { stockPhoto: false }), ctx);
    site = (await res.json()).data.site;
    expect(site.stock.enabled).toBe(false);

    stockMock.fn = async () => null;
    expect((await POST(req("POST", { action: "stock-next" }), ctx)).status).toBe(409);

    vi.stubEnv("UNSPLASH_ACCESS_KEY", "");
    res = await PATCH(req("PATCH", { stockPhoto: true }), ctx);
    expect((await res.json()).data.site.stock.available).toBe(false);
  });
});
