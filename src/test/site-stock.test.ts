import { afterEach, describe, expect, it, vi } from "vitest";

import { createFakeDb, type FakeDb } from "@/test/helpers/fake-supabase";

/**
 * Stock photo at the top of a page without the owner's photos (Pexels): the lookup, when the
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

function pexelsPhoto(id: number, patch: Record<string, unknown> = {}) {
  return {
    id,
    width: 6000,
    height: 4000,
    url: `https://www.pexels.com/photo/plow-${id}/`,
    alt: `Plow ${id}`,
    photographer: `Pat ${id}`,
    photographer_url: `https://www.pexels.com/@pat${id}`,
    src: { large2x: `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940` },
    ...patch,
  };
}

const STOCK: SiteStockPhoto = {
  id: 7,
  url: "https://images.pexels.com/photos/7/pexels-photo-7.jpeg",
  alt: "Snowy driveway",
  photographer: "Pat <Seven>",
  photographerUrl: "https://www.pexels.com/@pat7",
  pageUrl: "https://www.pexels.com/photo/plow-7/",
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

describe("Pexels lookup", () => {
  it("a search per trade, with a fallback", () => {
    expect(stockQuery("property-maintenance-snow")).toContain("snow");
    expect(stockQuery("roofing")).toContain("roof");
    expect(stockQuery(null)).toBe(stockQuery("not-a-trade"));
  });

  it("only usable landscape photos from Pexels' own hosts", () => {
    expect(toStockPhoto(pexelsPhoto(1), "q", 0)).toMatchObject({ id: 1, photographer: "Pat 1", url: expect.stringMatching(/^https:\/\/images\.pexels\.com\//) });
    expect(toStockPhoto(pexelsPhoto(2, { src: { large2x: "https://evil.example/x.jpg" } }), "q", 0)).toBeNull();
    expect(toStockPhoto(pexelsPhoto(3, { width: 1000, height: 3000 }), "q", 0)).toBeNull();
    expect(toStockPhoto(pexelsPhoto(4, { photographer_url: "javascript:alert(1)" }), "q", 0)?.photographerUrl).toBe("https://www.pexels.com/photo/plow-4/");
  });

  it("no key → no request; with a key: authorised search, a seeded pick, 'another' moves on and wraps", async () => {
    const fetch = vi.fn<StockFetch>(async () => ({ ok: true, status: 200, json: async () => ({ photos: [pexelsPhoto(1), pexelsPhoto(2), pexelsPhoto(3)] }) }));
    expect(await findStockPhoto({ tradeId: "roofing", seed: "c1", apiKey: null, fetch })).toBeNull();
    expect(fetch).not.toHaveBeenCalled();

    const first = await findStockPhoto({ tradeId: "roofing", seed: "c1", apiKey: "k", fetch });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toContain("https://api.pexels.com/v1/search?");
    expect(url).toContain("orientation=landscape");
    expect(decodeURIComponent(url.replace(/\+/g, " "))).toContain(stockQuery("roofing"));
    expect(init.headers.authorization).toBe("k");
    const ids = [first!.id];
    for (const index of [1, 2, 3]) ids.push((await findStockPhoto({ tradeId: "roofing", seed: "c1", index, apiKey: "k", fetch }))!.id);
    expect(new Set(ids.slice(0, 3)).size).toBe(3);
    expect(ids[3]).toBe(ids[0]);
  });

  it("a Pexels failure is just 'no photo'", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(await findStockPhoto({ tradeId: null, seed: "x", apiKey: "k", fetch: async () => ({ ok: false, status: 429, json: async () => ({}) }) })).toBeNull();
    expect(await findStockPhoto({ tradeId: null, seed: "x", apiKey: "k", fetch: async () => { throw new Error("offline"); } })).toBeNull();
    expect(await findStockPhoto({ tradeId: null, seed: "x", apiKey: "k", fetch: async () => ({ ok: true, status: 200, json: async () => ({ photos: [] }) }) })).toBeNull();
  });
});

describe("on the page", () => {
  it("fills the top of the page and credits the photographer and Pexels", () => {
    const html = renderSitePage(content(), opts);
    expect(heroPhoto(content())).toMatchObject({ stock: { id: 7 } });
    expect(html).toContain(`src="${STOCK.url}"`);
    expect(html).toContain("Top photo by");
    expect(html).toContain("Pat &lt;Seven&gt;");
    expect(html).toContain('href="https://www.pexels.com/photo/plow-7/"');
  });

  it("is never 'Our work', never in the business data, and never on the extra pages", () => {
    const html = renderSitePage(content(), opts);
    expect(html).not.toContain('id="photos-title"');
    expect(JSON.stringify(buildJsonLd(content(), opts))).not.toContain("pexels");
    const sub = renderSiteSubpage(content(), opts, sitePages(content())[0]);
    expect(sub).not.toContain("pexels");
  });

  it("the owner's photo wins, and the owner can switch it off", () => {
    const own = renderSitePage(content({}, ["https://cdn.example/own.jpg"]), opts);
    expect(own).toContain("https://cdn.example/own.jpg");
    expect(own).not.toContain("pexels");
    const off = renderSitePage(content({ settings: { ...content().settings, stockPhoto: false } }), opts);
    expect(off).not.toContain("pexels");
  });

  it("a stored photo off Pexels' hosts is dropped when read", () => {
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
    expect(parseSiteContent(db.tables.company_sites[0].content)!.stockPhoto).toMatchObject({ id: 7 });
    await generateSite(db.client, CO, { deps: deps(findStock) });
    expect(findStock).toHaveBeenCalledTimes(1);

    seed({ profile: { ...(snowCompany.company.profile as object), photos: ["https://cdn.example/own.jpg"] } });
    const unused = vi.fn(async () => STOCK);
    await generateSite(db.client, CO, { deps: deps(unused) });
    expect(unused).not.toHaveBeenCalled();
  });

  it("a Pexels outage never blocks the page", async () => {
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
    vi.stubEnv("PEXELS_API_KEY", "k");
    seed({ profile: { photos: [] } });
    stockMock.fn = async (input) => ({ ...STOCK, id: 100 + (input.index ?? 0), index: input.index ?? 0 });
    await POST(req("POST", { action: "generate" }), ctx);
    expect(parseSiteContent(db.tables.company_sites[0].content)!.stockPhoto).toMatchObject({ id: 100 });

    let res = await POST(req("POST", { action: "stock-next" }), ctx);
    let site = (await res.json()).data.site;
    expect(site.stock).toMatchObject({ available: true, enabled: true, photo: { photographer: "Pat <Seven>" } });
    expect(parseSiteContent(db.tables.company_sites[0].content)!.stockPhoto).toMatchObject({ id: 101, index: 1 });

    res = await PATCH(req("PATCH", { stockPhoto: false }), ctx);
    site = (await res.json()).data.site;
    expect(site.stock.enabled).toBe(false);

    stockMock.fn = async () => null;
    expect((await POST(req("POST", { action: "stock-next" }), ctx)).status).toBe(409);

    vi.stubEnv("PEXELS_API_KEY", "");
    res = await PATCH(req("PATCH", { stockPhoto: true }), ctx);
    expect((await res.json()).data.site.stock.available).toBe(false);
  });
});
