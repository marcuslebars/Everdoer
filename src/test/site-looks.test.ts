import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeDb, type FakeDb } from "@/test/helpers/fake-supabase";

/**
 * Generated-site looks (docs/done-for-you.md → "Looks"): the pure style helpers, every look
 * through the renderer (and its safety rules), and saving the owner's choice before and after
 * the page exists.
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

import { GET, PATCH, POST } from "@/app/api/organizations/[organizationId]/companies/[companyId]/site/route";
import { autoThemeForTrade, parseSiteStyle, resolveSiteTheme, SITE_COLOR_SWATCHES } from "@/lib/site-style";
import { snowCompany } from "@/server/services/dfy/__fixtures__/sample-sites";
import {
  buildSiteFacts,
  factsUsed,
  initialSiteSettings,
  parseSiteContent,
  templateSiteCopy,
  SITE_CONTENT_VERSION,
  type SiteContent,
  type SiteFactsInput,
  parseSiteSections,
  defaultSitePagesSettings,
} from "@/server/services/dfy/site-content";
import { updateSiteStyle } from "@/server/services/dfy/site-generator";
import { renderSitePage } from "@/server/services/dfy/site-render";

const opts = { url: "https://pages.everdoer.com/northshore", formKey: "evpk_0123456789abcdef0123456789abcdef", bookingUrl: null, turnstileSiteKey: null, creditUrl: "https://everdoer.com" };

function contentFor(input: SiteFactsInput, settings: Partial<SiteContent["settings"]> = {}, patch: Partial<SiteContent> = {}): SiteContent {
  const facts = buildSiteFacts(input);
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
    generatedAt: "2026-11-20T12:00:00.000Z",
    ...patch,
  };
}

const withPhotos: SiteFactsInput = {
  ...snowCompany,
  company: { ...snowCompany.company, profile: { ...(snowCompany.company.profile as Record<string, unknown>), photos: ["https://cdn.example.com/a.jpg", "https://cdn.example.com/b.jpg"] } },
};

describe("site style helpers", () => {
  it("parses defensively: bad theme → auto, bad colour → null, colours lower-cased", () => {
    expect(parseSiteStyle(null)).toEqual({ theme: "auto", color: null });
    expect(parseSiteStyle({ theme: "neon", color: "red" })).toEqual({ theme: "auto", color: null });
    expect(parseSiteStyle({ theme: "classic", color: "#1F3A2E" })).toEqual({ theme: "classic", color: "#1f3a2e" });
    expect(parseSiteStyle({ theme: "bold", color: "#123" })).toEqual({ theme: "bold", color: null });
  });

  it("'Pick for me' maps trades to looks", () => {
    expect(autoThemeForTrade("roofing")).toBe("bold");
    expect(autoThemeForTrade("property-maintenance-snow")).toBe("bold");
    expect(autoThemeForTrade("general-contractor")).toBe("bold");
    expect(autoThemeForTrade("hvac-plumbing")).toBe("clean");
    expect(autoThemeForTrade("landscaping")).toBe("classic");
    expect(autoThemeForTrade("marine")).toBe("classic");
    expect(autoThemeForTrade(null)).toBe("clean");
    expect(resolveSiteTheme("auto", "landscaping")).toBe("classic");
    expect(resolveSiteTheme("clean", "landscaping")).toBe("clean");
  });

  it("every swatch keeps white text readable (4.5:1)", () => {
    const lum = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => {
        const c = parseInt(hex.slice(i, i + 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    for (const hex of SITE_COLOR_SWATCHES) expect(1.05 / (lum(hex) + 0.05)).toBeGreaterThanOrEqual(4.5);
  });

  it("old pages without a look read as 'pick for me'; new pages start from the company's choice", () => {
    const old = { ...contentFor(snowCompany), settings: { showPrices: false } };
    expect(parseSiteContent(old)?.settings).toEqual({ showPrices: false, stockPhoto: true, theme: "auto", color: null, sections: parseSiteSections(null), pages: defaultSitePagesSettings() });
    expect(initialSiteSettings({ theme: "classic", color: "#0f766e" })).toEqual({ showPrices: true, stockPhoto: true, theme: "classic", color: "#0f766e", sections: parseSiteSections(null), pages: defaultSitePagesSettings() });
    expect(initialSiteSettings({})).toEqual({ showPrices: true, stockPhoto: true, theme: "auto", color: null, sections: parseSiteSections(null), pages: defaultSitePagesSettings() });
  });
});

describe("renderer looks", () => {
  it.each([
    ["bold", "family=Archivo"],
    ["clean", "family=Plus+Jakarta+Sans"],
    ["classic", "family=Fraunces"],
  ] as const)("%s: its body class and fonts, and the same form, call bar and JSON-LD", (theme, font) => {
    const html = renderSitePage(contentFor(withPhotos, { theme }), opts);
    expect(html).toContain(`<body class="look-${theme}">`);
    expect(html).toContain(font);
    expect(html).toContain('id="quote-form"');
    expect(html).toContain('class="bar"');
    expect(html).toContain('application/ld+json');
    expect(html).toContain("tel:+17055550142");
  });

  it("'auto' draws the trade's look (snow → bold)", () => {
    expect(renderSitePage(contentFor(snowCompany, { theme: "auto" }), opts)).toContain('<body class="look-bold">');
  });

  it("classic puts the first photo full-bleed behind the headline; without photos it's a colour band", () => {
    const withPhoto = renderSitePage(contentFor(withPhotos, { theme: "classic" }), opts);
    expect(withPhoto).toContain('class="hero classic has-photo"');
    expect(withPhoto).toContain('<img class="hero-bg" src="https://cdn.example.com/a.jpg"');
    const without = renderSitePage(contentFor(snowCompany, { theme: "classic" }), opts);
    expect(without).toContain('class="hero classic"');
    expect(without).not.toContain("<img class=\"hero-bg\"");
  });

  it("bold sets a short headline in capitals, a long one in normal case", () => {
    const short = renderSitePage(contentFor(snowCompany, { theme: "bold" }, { edits: { headline: "Snow cleared before you wake up" } }), opts);
    expect(short).toContain('<h1 class="caps">Snow cleared before you wake up</h1>');
    const long = renderSitePage(contentFor(snowCompany, { theme: "bold" }), opts);
    expect(long).toMatch(/<h1>[^<]{49,}<\/h1>/);
  });

  it("the owner's colour wins over the brand and trade colours", () => {
    const input: SiteFactsInput = { ...snowCompany, company: { ...snowCompany.company, brand_primary_color: "#222222" } };
    expect(renderSitePage(contentFor(input, { theme: "clean", color: "#0f766e" }), opts)).toContain('<meta name="theme-color" content="#0f766e">');
    expect(renderSitePage(contentFor(input, { theme: "clean", color: null }), opts)).toContain('<meta name="theme-color" content="#222222">');
  });

  it.each(["bold", "clean", "classic"] as const)("%s keeps the escaping rules", (theme) => {
    const evil = '<script>alert("x")</script>';
    const hostile: SiteFactsInput = {
      ...snowCompany,
      company: {
        ...snowCompany.company,
        name: `Evil ${evil}`,
        service_area: `<img src=x onerror=alert(1)>`,
        profile: { about: "x", photos: ["javascript:alert(1)", "https://cdn.example.com/ok.jpg"] },
      },
    };
    const html = renderSitePage(contentFor(hostile, { theme, color: "red;}</style><script>alert(2)</script>" as never }), opts);
    expect(html).not.toContain(evil);
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("javascript:alert");
    expect(html).not.toContain("alert(2)");
  });
});

// ── Saving the look ─────────────────────────────────────────────────────────

const ORG = "org-1";
const ctx = (companyId = "c1") => ({ params: { organizationId: ORG, companyId } });
const req = (method: string, body?: unknown) =>
  new Request(`http://test/api/organizations/${ORG}/companies/c1/site`, { method, body: body ? JSON.stringify(body) : undefined, headers: { "content-type": "application/json" } });

function seed(role: string | null, siteStyle: unknown = {}) {
  db = createFakeDb(
    {
      organization_memberships: role ? [{ id: "m1", organization_id: ORG, profile_id: "u1", role }] : [],
      profiles: [{ id: "u1", email: "o@example.com" }],
      organizations: [{ id: ORG, platform_brand: "crankleads", crankleads_tier: "close", subscription_status: "active" }],
      companies: [
        { id: "c1", organization_id: ORG, ...snowCompany.company, industry_pack: { id: "landscaping", version: 1 }, online_booking_settings: {}, quote_public_base_url: null, site_style: siteStyle },
      ],
      service_catalog_items: [],
      public_form_keys: [],
      company_sites: [],
    },
    { company_sites: [["slug"], ["company_id"]] },
  );
  user = { id: "u1" };
}

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "");
});

describe("saving the look", () => {
  it("before the page exists: kept on the company and used when the page is built", async () => {
    seed("owner");
    const res = await PATCH(req("PATCH", { theme: "classic", color: "#1f3a2e" }), ctx());
    expect(res.status).toBe(200);
    const view = (await res.json()).data;
    expect(view).toMatchObject({ site: null, style: { theme: "classic", color: "#1f3a2e" }, autoTheme: "classic" });
    expect(db.tables.companies[0].site_style).toEqual({ theme: "classic", color: "#1f3a2e" });

    const built = await POST(req("POST", { action: "generate" }), ctx());
    expect(built.status).toBe(200);
    expect((await built.json()).data.site).toMatchObject({ theme: "classic", color: "#1f3a2e" });
  });

  it("after: the page is redrawn in the new look without regenerating the copy", async () => {
    seed("owner");
    await POST(req("POST", { action: "generate" }), ctx());
    const before = db.tables.company_sites[0] as { content: SiteContent; generated_at: string };
    const res = await PATCH(req("PATCH", { theme: "bold" }), ctx());
    expect(res.status).toBe(200);
    const after = db.tables.company_sites[0] as { content: SiteContent; generated_at: string };
    expect(after.content.settings).toMatchObject({ theme: "bold", color: null });
    expect(after.content.copy).toEqual(before.content.copy);
    expect(after.generated_at).toBe(before.generated_at);
    expect(db.tables.companies[0].site_style).toEqual({ theme: "bold", color: null });
  });

  it("a colour change keeps the theme, and the look rides along with other edits", async () => {
    seed("owner", { theme: "clean", color: null });
    await POST(req("POST", { action: "generate" }), ctx());
    await PATCH(req("PATCH", { color: "#b91c1c", headline: "Hello" }), ctx());
    const site = db.tables.company_sites[0] as { content: SiteContent };
    expect(site.content.settings).toMatchObject({ theme: "clean", color: "#b91c1c" });
    expect(site.content.edits.headline).toBe("Hello");
  });

  it("refuses bad values and non-managers", async () => {
    seed("owner");
    expect((await PATCH(req("PATCH", { theme: "neon" }), ctx())).status).toBe(400);
    expect((await PATCH(req("PATCH", { color: "red" }), ctx())).status).toBe(400);
    seed("member");
    expect((await PATCH(req("PATCH", { theme: "bold" }), ctx())).status).toBe(403);
    expect(db.tables.companies[0].site_style).toEqual({});
  });

  it("GET shows what 'Pick for me' means for the trade", async () => {
    seed("member");
    const view = (await (await GET(req("GET"), ctx())).json()).data;
    expect(view).toMatchObject({ style: { theme: "auto", color: null }, autoTheme: "classic" });
  });

  it("updateSiteStyle returns null when there's no page yet", async () => {
    seed("owner");
    expect(await updateSiteStyle(db.client as never, "c1", { theme: "clean" })).toBeNull();
  });
});
