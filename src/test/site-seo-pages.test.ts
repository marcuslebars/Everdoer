import { afterEach, describe, expect, it, vi } from "vitest";

import { createFakeDb, type FakeDb } from "@/test/helpers/fake-supabase";

/**
 * Service and town pages + sitemap (docs/done-for-you.md → "Generated sites" → "Service and
 * town pages"): what pages a site gets, what they say, and how they're served.
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

import { GET as pageGET } from "@/app/s/[slug]/[page]/route";
import { GET as homeGET } from "@/app/s/[slug]/route";
import { GET as previewGET } from "@/app/api/organizations/[organizationId]/companies/[companyId]/site/preview/route";
import { PATCH } from "@/app/api/organizations/[organizationId]/companies/[companyId]/site/route";
import { snowCompany } from "@/server/services/dfy/__fixtures__/sample-sites";
import {
  buildSiteFacts,
  defaultSitePagesSettings,
  factsUsed,
  parseSiteContent,
  parseSiteSections,
  SITE_CONTENT_VERSION,
  templateSiteCopy,
  type SiteContent,
} from "@/server/services/dfy/site-content";
import { findSitePage, pageSlug, parseServiceTowns, sitePages, siteSitemapXml, type SiteAreaPage, type SiteServicePage } from "@/server/services/dfy/site-pages";
import { renderSitePage, renderSiteSubpage } from "@/server/services/dfy/site-render";

const ORG = "org-1";
const CO = "c1";
const KEY = "evpk_0123456789abcdef0123456789abcdef";
const HOME = "https://pages.everdoer.com/northshore-snow";
const opts = { url: HOME, formKey: KEY, bookingUrl: null, turnstileSiteKey: null, creditUrl: null };

function content(patch: Partial<SiteContent> = {}, settings: Partial<SiteContent["settings"]> = {}): SiteContent {
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
    settings: { showPrices: true, stockPhoto: true, theme: "auto", color: null, sections: parseSiteSections(null), pages: defaultSitePagesSettings(), ...settings },
    copyNote: null,
    stockPhoto: null,
    generatedAt: "2026-11-21T12:00:00.000Z",
    ...patch,
  };
}

const ld = (html: string) => [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map((m) => JSON.parse(m[1]) as Record<string, unknown>);

describe("towns and paths", () => {
  it("reads towns from a service area, skipping regions and distances", () => {
    expect(parseServiceTowns("Barrie, Innisfil and Oro-Medonte")).toEqual(["Barrie", "Innisfil", "Oro-Medonte"]);
    expect(parseServiceTowns("south Barrie & Innisfil")).toEqual(["Barrie", "Innisfil"]);
    expect(parseServiceTowns("Simcoe County and the GTA")).toEqual([]);
    expect(parseServiceTowns("30 km around Midland")).toEqual([]);
    expect(parseServiceTowns("Midland / Penetanguishene / Midland")).toEqual(["Midland", "Penetanguishene"]);
    expect(parseServiceTowns("A1, B2, Cc, Dd, Ee, Ff, Gg, Hh")).toHaveLength(6);
    expect(parseServiceTowns(null)).toEqual([]);
  });

  it("makes plain, safe page addresses", () => {
    expect(pageSlug("Roof snow removal")).toBe("roof-snow-removal");
    expect(pageSlug("Lawn & Garden")).toBe("lawn-and-garden");
    expect(pageSlug("Déneigement — résidentiel")).toBe("deneigement-residentiel");
    expect(pageSlug("Owner's <script>")).toBe("owners-script");
  });
});

describe("which pages a site gets", () => {
  it("a page per service and per town; a price page gets none", () => {
    const pages = sitePages(content());
    const services = pages.filter((p) => p.kind === "service");
    const areas = pages.filter((p): p is SiteAreaPage => p.kind === "area");
    expect(services).toHaveLength(buildSiteFacts(snowCompany).services.length);
    expect(areas.map((p) => p.town)).toEqual(["Barrie", "Innisfil", "Oro-Medonte"]);
    expect(areas[0].path).toMatch(/-barrie$/);
    expect(new Set(pages.map((p) => p.path)).size).toBe(pages.length);
    expect(sitePages(content({ mode: "price_page" }))).toEqual([]);
  });

  it("owner switches and town list; one town gets no town page", () => {
    expect(sitePages(content({}, { pages: { services: false, areas: true, towns: null } })).every((p) => p.kind === "area")).toBe(true);
    expect(sitePages(content({}, { pages: { services: true, areas: false, towns: null } })).every((p) => p.kind === "service")).toBe(true);
    const own = sitePages(content({}, { pages: { services: false, areas: true, towns: ["Midland", "Tiny"] } }));
    expect(own.map((p) => p.label)).toEqual([expect.stringMatching(/ in Midland$/), expect.stringMatching(/ in Tiny$/)]);
    expect(sitePages(content({}, { pages: { services: false, areas: true, towns: ["Midland"] } }))).toEqual([]);
  });

  it("never takes a reserved path, and repeated names get a number", () => {
    const facts = buildSiteFacts(snowCompany);
    const services = [
      { key: "a", label: "Jobs", priceText: null, priceNote: null, description: null },
      { key: "b", label: "Plowing", priceText: null, priceNote: null, description: null },
      { key: "c", label: "Plowing!", priceText: null, priceNote: null, description: null },
    ];
    const pages = sitePages(content({ facts: { ...facts, services } }, { pages: { services: true, areas: false, towns: null } }));
    expect(pages.map((p) => p.path)).toEqual(["jobs-2", "plowing", "plowing-2"]);
    expect(findSitePage(content({ facts: { ...facts, services } }), "PLOWING/")).toMatchObject({ path: "plowing" });
    expect(findSitePage(content(), "../etc")).toBeNull();
  });
});

describe("page content", () => {
  it("service page: its own title and address, price, Service + breadcrumb data, the form set to it", () => {
    const c = content();
    const page = sitePages(c).find((p): p is SiteServicePage => p.kind === "service" && Boolean(p.service.priceText))!;
    const html = renderSiteSubpage(c, opts, page);
    expect(html).toContain(`<link rel="canonical" href="${HOME}/${page.path}">`);
    expect(html).toMatch(new RegExp(`<title>${page.service.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} in Barrie, Innisfil and Oro-Medonte \\| `));
    expect(html).toContain(page.service.priceText!.split(" / ")[0]);
    expect(html).toContain(`<option value="${page.service.label}" selected>`);
    expect(html).not.toContain('id="faq-title"');
    expect(html).toContain('id="more-title"');
    const blocks = ld(html);
    expect(blocks.find((b) => b["@type"] === "Service")).toMatchObject({ name: page.service.label, url: `${HOME}/${page.path}` });
    expect(blocks.find((b) => b["@type"] === "BreadcrumbList")).toBeTruthy();
    // Prices off: the price isn't on the service page either.
    const off = renderSiteSubpage(content({}, { showPrices: false }), opts, page);
    expect(off).not.toContain(page.service.priceText!.split(" / ")[0]);
  });

  it("town page: the trade in that town, every service linked, LocalBusiness serving the town", () => {
    const c = content();
    const page = sitePages(c).find((p): p is SiteAreaPage => p.kind === "area" && p.town === "Innisfil")!;
    const html = renderSiteSubpage(c, opts, page);
    expect(html).toContain(`>${page.label}</h1>`);
    expect(html).toContain("and nearby in Barrie, Oro-Medonte");
    for (const s of sitePages(c).filter((p) => p.kind === "service")) expect(html).toContain(`href="${HOME}/${s.path}"`);
    const business = ld(html).find((b) => b["@type"] !== "BreadcrumbList")!;
    expect(business.areaServed).toEqual({ "@type": "City", name: "Innisfil" });
    expect(business).not.toHaveProperty("aggregateRating");
  });

  it("the home page links its services and the towns; owner-hidden sections stay hidden on every page", () => {
    const c = content({}, { sections: parseSiteSections([{ id: "steps", hidden: true }, { id: "reviews", hidden: true }]) });
    const home = renderSitePage(c, opts);
    const first = sitePages(c)[0];
    expect(home).toContain(`<a href="${HOME}/${first.path}">`);
    expect(home).toContain('aria-label="Areas we serve"');
    const sub = renderSiteSubpage(c, opts, first);
    expect(sub).not.toContain('id="how-title"');
    expect(sub).not.toContain('id="reviews-title"');
  });

  it("owner and company text on the pages is escaped", () => {
    const facts = buildSiteFacts(snowCompany);
    const evil = '"><script>alert(1)</script>';
    const c = content({ facts: { ...facts, name: evil, services: [{ key: "x", label: `Plow ${evil}`, priceText: null, priceNote: null, description: evil }] } });
    const html = renderSiteSubpage(c, opts, sitePages(c)[0]);
    expect(html).not.toContain("<script>alert(1)</script>");
  });

  it("sitemap: the home page and every page, escaped", () => {
    const c = content();
    const xml = siteSitemapXml(c, HOME, "2026-11-21T12:00:00Z");
    expect(xml).toContain(`<loc>${HOME}</loc><lastmod>2026-11-21</lastmod>`);
    for (const p of sitePages(c)) expect(xml).toContain(`<loc>${HOME}/${p.path}</loc>`);
    expect(siteSitemapXml(c, "https://x/a&b", null)).toContain("<loc>https://x/a&amp;b</loc>");
  });
});

// ── Serving ─────────────────────────────────────────────────────────────────

function seed(site: Record<string, unknown> = {}, c: SiteContent = content()) {
  db = createFakeDb(
    {
      organization_memberships: [{ id: "m1", organization_id: ORG, profile_id: "u1", role: "owner" }],
      profiles: [{ id: "u1", email: "o@example.com" }],
      organizations: [{ id: ORG, platform_brand: "everdoer", subscription_status: "active" }],
      companies: [{ id: CO, organization_id: ORG, ...snowCompany.company, online_booking_settings: {}, quote_public_base_url: null }],
      company_sites: [
        {
          id: "site-1",
          organization_id: ORG,
          company_id: CO,
          slug: "northshore-snow",
          status: "published",
          mode: "full",
          content: c,
          favicon_url: null,
          custom_domain: null,
          custom_domain_status: "none",
          updated_at: "2026-11-21T12:00:00.000Z",
          ...site,
        },
      ],
      public_form_keys: [{ id: "k1", organization_id: ORG, company_id: CO, public_key: KEY, form_type: "quote", active: true, created_at: "2026-10-01T00:00:00Z" }],
    },
    { company_sites: [["slug"], ["company_id"]] },
  );
  user = { id: "u1" };
}

const get = (url: string, headers: Record<string, string> = {}) => new Request(url, { headers });

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("serving", () => {
  it("a published site's pages and sitemap; unknown pages and unpublished sites are the neutral 404", async () => {
    seed();
    const page = sitePages(content())[0];
    const ok = await pageGET(get(`http://t/s/northshore-snow/${page.path}`), { params: { slug: "northshore-snow", page: page.path } });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toContain("text/html");
    expect(ok.headers.get("etag")).toBeTruthy();
    expect(await ok.text()).toContain(`>${page.label}</span>`);

    const map = await pageGET(get("http://t/s/northshore-snow/sitemap.xml"), { params: { slug: "northshore-snow", page: "sitemap.xml" } });
    expect(map.headers.get("content-type")).toContain("application/xml");
    expect(await map.text()).toContain(`/northshore-snow/${page.path}</loc>`);

    expect((await pageGET(get("http://t/s/northshore-snow/nope"), { params: { slug: "northshore-snow", page: "nope" } })).status).toBe(404);
    expect((await homeGET(get("http://t/s/northshore-snow"), { params: { slug: "northshore-snow" } })).status).toBe(200);

    seed({ status: "draft" });
    expect((await pageGET(get(`http://t/s/northshore-snow/${page.path}`), { params: { slug: "northshore-snow", page: page.path } })).status).toBe(404);
  });

  it("a business's own domain: pages come through the signed edge header and link on that domain", async () => {
    vi.stubEnv("SITES_EDGE_KEY", "e".repeat(32));
    seed({ custom_domain: "www.acme.ca", custom_domain_status: "active" });
    const page = sitePages(content())[0];
    const headers = { "x-everdoer-edge-key": "e".repeat(32), "x-everdoer-site-host": "www.acme.ca" };
    const res = await pageGET(get(`http://t/s/_domain/${page.path}`, headers), { params: { slug: "_domain", page: page.path } });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-cache");
    expect(await res.text()).toContain(`<link rel="canonical" href="https://www.acme.ca/${page.path}">`);
    const map = await pageGET(get("http://t/s/_domain/sitemap.xml", headers), { params: { slug: "_domain", page: "sitemap.xml" } });
    expect(await map.text()).toContain(`<loc>https://www.acme.ca/${page.path}</loc>`);
    // No key → nothing is trusted.
    expect((await pageGET(get(`http://t/s/_domain/${page.path}`), { params: { slug: "_domain", page: page.path } })).status).toBe(404);
  });

  it("the owner preview opens any page, and its links stay in the preview", async () => {
    seed({ status: "draft" });
    const page = sitePages(content())[0];
    const base = `/api/organizations/${ORG}/companies/${CO}/site/preview`;
    const res = await previewGET(get(`http://t${base}?page=${page.path}`), { params: { organizationId: ORG, companyId: CO } });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain(`href="${base}"`);
    expect(html).toContain('name="robots" content="noindex,nofollow"');
    expect((await previewGET(get(`http://t${base}?page=nope`), { params: { organizationId: ORG, companyId: CO } })).status).toBe(404);
  });

  it("owners switch pages and set their towns", async () => {
    seed();
    const ctx = { params: { organizationId: ORG, companyId: CO } };
    const patch = (body: unknown) => PATCH(new Request("http://t/x", { method: "PATCH", body: JSON.stringify(body), headers: { "content-type": "application/json" } }), ctx);
    let res = await patch({ pages: { towns: ["Midland", "Tiny", "<b>"] } });
    expect(res.status).toBe(200);
    let view = (await res.json()).data.site.pages;
    expect(view.towns).toEqual(["Midland", "Tiny"]);
    expect(view.list.filter((p: { kind: string }) => p.kind === "area").map((p: { label: string }) => p.label)).toEqual([expect.stringMatching(/Midland$/), expect.stringMatching(/Tiny$/)]);
    expect(view.list[0].previewUrl).toContain("/site/preview?page=");

    res = await patch({ pages: { services: false, towns: null } });
    view = (await res.json()).data.site.pages;
    expect(view).toMatchObject({ services: false, towns: null, areaTowns: ["Barrie", "Innisfil", "Oro-Medonte"] });
    expect(parseSiteContent(db.tables.company_sites[0].content)!.settings.pages.services).toBe(false);

    expect((await patch({ pages: { towns: ["A1", "Bb", "Cc", "Dd", "Ee", "Ff", "Gg"] } })).status).toBe(400);
    expect((await patch({ pages: { everything: true } })).status).toBe(400);
  });
});
