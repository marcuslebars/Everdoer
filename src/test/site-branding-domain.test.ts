/**
 * Your website: logo, photos and tab icon (site-images.ts), the business's own domain
 * (site-domain.ts), serving a page on that domain (site-host.ts, /s/[slug] route), and the
 * renderer's favicon, gallery and embedded form.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeDb, type FakeDb } from "@/test/helpers/fake-supabase";

let db: FakeDb;
vi.mock("@/server/supabase/admin", () => ({ createSupabaseAdminClient: () => db.client }));

import { GET as siteGET } from "@/app/s/[slug]/route";
import { snowCompany } from "@/server/services/dfy/__fixtures__/sample-sites";
import { buildSiteFacts, chooseSiteMode, factsUsed, templateSiteCopy, SITE_CONTENT_VERSION, type SiteContent } from "@/server/services/dfy/site-content";
import {
  checkSiteDomain,
  connectSiteDomain,
  domainCheckDue,
  normalizeDomain,
  readRailwayStatus,
  removeSiteDomain,
  verificationRecord,
  type DomainDeps,
  type RailwayFetch,
} from "@/server/services/dfy/site-domain";
import { customDomainRewritePath, CUSTOM_DOMAIN_SITE_PATH } from "@/server/services/dfy/site-host";
import {
  createSiteImageUpload,
  makeCoverPhoto,
  ownImagePath,
  pathFromPublicUrl,
  profilePhotos,
  removeSiteImage,
  saveSiteImage,
} from "@/server/services/dfy/site-images";
import { sitePublicUrl } from "@/server/services/dfy/site-public";
import { renderSitePage } from "@/server/services/dfy/site-render";

const ORG = "11111111-1111-4111-8111-111111111111";
const CO = "22222222-2222-4222-8222-222222222222";
const scope = { organizationId: ORG, companyId: CO };
const STORAGE = "https://proj.supabase.co/storage/v1/object/public/site-images/";
const uuid = (n: number) => `0000000${n}-aaaa-4bbb-8ccc-dddddddddddd`;

function content(): SiteContent {
  const facts = buildSiteFacts(snowCompany);
  const mode = chooseSiteMode(snowCompany.company.website);
  return {
    version: SITE_CONTENT_VERSION,
    mode,
    facts,
    factsUsed: factsUsed(facts),
    copy: templateSiteCopy(facts, mode),
    copySource: "template",
    copyNotes: [],
    edits: {},
    settings: { showPrices: true },
    generatedAt: "2026-10-31T12:00:00.000Z",
  };
}

/** A fake storage bucket: objects by path, signed URLs, public URLs. */
function fakeStorage() {
  const objects = new Set<string>();
  const removed: string[] = [];
  const bucket = {
    createSignedUploadUrl: async (path: string) => ({ data: { token: `tok-${path}`, signedUrl: `https://signed/${path}` }, error: null }),
    list: async (dir: string, opts: { search: string }) => ({
      data: [...objects].filter((p) => p.startsWith(`${dir}/`) && p.slice(dir.length + 1) === opts.search).map((p) => ({ name: p.slice(dir.length + 1) })),
      error: null,
    }),
    getPublicUrl: (path: string) => ({ data: { publicUrl: `${STORAGE}${path}` } }),
    remove: async (paths: string[]) => {
      removed.push(...paths);
      paths.forEach((p) => objects.delete(p));
      return { data: [], error: null };
    },
  };
  return { objects, removed, api: { from: () => bucket } };
}

let storage: ReturnType<typeof fakeStorage>;

function seed(company: Record<string, unknown> = {}, site: Record<string, unknown> | null = {}) {
  db = createFakeDb({
    companies: [{ id: CO, organization_id: ORG, name: "Northshore Snow", brand_logo_url: null, profile: {}, ...company }],
    company_sites: site
      ? [
          {
            id: "site-1",
            organization_id: ORG,
            company_id: CO,
            slug: "northshore-snow",
            status: "published",
            content: content(),
            favicon_url: null,
            custom_domain: null,
            custom_domain_ref: null,
            custom_domain_status: "none",
            custom_domain_dns: null,
            custom_domain_checked_at: null,
            updated_at: "2026-10-31T12:00:00.000Z",
            ...site,
          },
        ]
      : [],
    public_form_keys: [{ organization_id: ORG, company_id: CO, public_key: "evpk_0123456789abcdef0123456789abcdef", form_type: "quote", active: true, created_at: "2026-10-01T00:00:00Z" }],
  });
  storage = fakeStorage();
  Object.assign(db.client, { storage: storage.api });
}

const siteRow = () => db.tables.company_sites[0] as Record<string, unknown>;
const companyRow = () => db.tables.companies[0] as Record<string, unknown>;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("image paths (pure)", () => {
  it("only this company's objects of the right kind and format", () => {
    expect(ownImagePath(scope, "logo", `${ORG}/${CO}/logo-${uuid(1)}.png`)).not.toBeNull();
    expect(ownImagePath(scope, "photo", `${ORG}/${CO}/photo-${uuid(1)}.jpg`)).not.toBeNull();
    expect(ownImagePath(scope, "logo", `${ORG}/${CO}/logo-${uuid(1)}.jpg`)).toBeNull();
    expect(ownImagePath(scope, "logo", `${ORG}/other/logo-${uuid(1)}.png`)).toBeNull();
    expect(ownImagePath(scope, "favicon", `${ORG}/${CO}/../x/favicon-${uuid(1)}.png`)).toBeNull();
  });

  it("public URL → path; outside URLs → null", () => {
    expect(pathFromPublicUrl(`${STORAGE}${ORG}/${CO}/logo-${uuid(1)}.png`)).toBe(`${ORG}/${CO}/logo-${uuid(1)}.png`);
    expect(pathFromPublicUrl("https://acme.ca/logo.png")).toBeNull();
  });

  it("profile photos: strings or { url }, https only, at most 6", () => {
    expect(profilePhotos({ photos: ["https://a/1.jpg", { url: "https://a/2.jpg" }, "http://a/3.jpg", 4] })).toEqual(["https://a/1.jpg", "https://a/2.jpg"]);
    expect(profilePhotos({ photos: Array.from({ length: 9 }, (_, i) => `https://a/${i}.jpg`) })).toHaveLength(6);
    expect(profilePhotos(null)).toEqual([]);
  });
});

describe("logo, photos and tab icon", () => {
  beforeEach(() => seed());

  it("upload URL is under this company's folder, as the kind's format", async () => {
    const up = await createSiteImageUpload(db.client, scope, "logo");
    expect(up.path).toMatch(new RegExp(`^${ORG}/${CO}/logo-[0-9a-f-]{36}\\.png$`));
    expect(up.contentType).toBe("image/png");
    expect((await createSiteImageUpload(db.client, scope, "photo")).contentType).toBe("image/jpeg");
  });

  it("logo: saved to the company (quotes and invoices use it too) and copied into the page", async () => {
    const path = `${ORG}/${CO}/logo-${uuid(1)}.png`;
    storage.objects.add(path);
    await saveSiteImage(db.client, scope, "logo", path);
    expect(companyRow().brand_logo_url).toBe(`${STORAGE}${path}`);
    expect((siteRow().content as SiteContent).facts.logoUrl).toBe(`${STORAGE}${path}`);
    expect((siteRow().content as SiteContent).factsUsed).toContain("logo");
  });

  it("replacing the logo deletes the old file of ours", async () => {
    const old = `${ORG}/${CO}/logo-${uuid(1)}.png`;
    const next = `${ORG}/${CO}/logo-${uuid(2)}.png`;
    storage.objects.add(old).add(next);
    companyRow().brand_logo_url = `${STORAGE}${old}`;
    await saveSiteImage(db.client, scope, "logo", next);
    expect(storage.removed).toEqual([old]);
  });

  it("refuses an upload that isn't there, or isn't this company's", async () => {
    await expect(saveSiteImage(db.client, scope, "logo", `${ORG}/${CO}/logo-${uuid(1)}.png`)).rejects.toThrow(/didn't finish/);
    await expect(saveSiteImage(db.client, scope, "logo", `${ORG}/someone/logo-${uuid(1)}.png`)).rejects.toThrow(/doesn't belong/);
  });

  it("photos: added at the end, up to 6; cover moves one first; remove drops it; the page follows", async () => {
    const urls: string[] = [];
    for (let i = 1; i <= 3; i++) {
      const p = `${ORG}/${CO}/photo-${uuid(i)}.jpg`;
      storage.objects.add(p);
      await saveSiteImage(db.client, scope, "photo", p);
      urls.push(`${STORAGE}${p}`);
    }
    expect(profilePhotos(companyRow().profile)).toEqual(urls);
    await makeCoverPhoto(db.client, scope, urls[2]);
    expect(profilePhotos(companyRow().profile)).toEqual([urls[2], urls[0], urls[1]]);
    await removeSiteImage(db.client, scope, "photo", urls[0]);
    expect(profilePhotos(companyRow().profile)).toEqual([urls[2], urls[1]]);
    expect((siteRow().content as SiteContent).facts.photos).toEqual([urls[2], urls[1]]);
    expect(storage.removed).toEqual([`${ORG}/${CO}/photo-${uuid(1)}.jpg`]);
  });

  it("a seventh photo is refused", async () => {
    companyRow().profile = { photos: Array.from({ length: 6 }, (_, i) => `https://x/${i}.jpg`) };
    await expect(createSiteImageUpload(db.client, scope, "photo")).rejects.toThrow(/up to 6/);
  });

  it("removing a photo from somewhere else never deletes a file that isn't ours", async () => {
    companyRow().profile = { photos: ["https://acme.ca/a.jpg"] };
    await removeSiteImage(db.client, scope, "photo", "https://acme.ca/a.jpg");
    expect(storage.removed).toEqual([]);
    expect(profilePhotos(companyRow().profile)).toEqual([]);
  });

  it("tab icon: on the site row; needs a page first", async () => {
    const p = `${ORG}/${CO}/favicon-${uuid(1)}.png`;
    storage.objects.add(p);
    await saveSiteImage(db.client, scope, "favicon", p);
    expect(siteRow().favicon_url).toBe(`${STORAGE}${p}`);
    await removeSiteImage(db.client, scope, "favicon");
    expect(siteRow().favicon_url).toBeNull();
    seed({}, null);
    storage.objects.add(p);
    await expect(saveSiteImage(db.client, scope, "favicon", p)).rejects.toThrow(/Create your page first/);
  });
});

describe("domains (pure)", () => {
  it("normalizes what owners type", () => {
    expect(normalizeDomain("https://WWW.Acme-Roofing.ca/contact")).toBe("www.acme-roofing.ca");
    expect(normalizeDomain(" acme.ca. ")).toBe("acme.ca");
    expect(normalizeDomain("acme.ca:443")).toBe("acme.ca");
  });

  it("refuses non-domains and our own", () => {
    for (const bad of ["", "acme", "acme..ca", "-acme.ca", "http://", "1.2.3.4", "app.everdoer.com", "x.up.railway.app", "acme.example.com"]) {
      expect(() => normalizeDomain(bad)).toThrow();
    }
  });

  it("Railway status → records to add, live once routing is valid and the certificate issued", () => {
    const pending = readRailwayStatus("www.acme.ca", { verificationToken: "abc123", certificateStatus: "PENDING", dnsRecords: [{ hostlabel: "www", requiredValue: "x1.up.railway.app.", status: "PENDING" }] });
    expect(pending.active).toBe(false);
    expect(pending.dns.records).toEqual([
      { type: "CNAME", name: "www", value: "x1.up.railway.app", status: "PENDING" },
      { type: "TXT", name: "_railway-verify.www", value: "railway-verify=abc123", status: null },
    ]);
    expect(readRailwayStatus("www.acme.ca", { certificateStatus: "ISSUED", dnsRecords: [{ hostlabel: "www", requiredValue: "x1.up.railway.app", status: "VALID" }] }).active).toBe(true);
    expect(readRailwayStatus("acme.ca", { dnsRecords: [{ hostlabel: "", requiredValue: "x1.up.railway.app", status: "VALID" }] }).dns.records[0].name).toBe("@");
  });

  it("verification record for the root and a token that already has its prefix", () => {
    expect(verificationRecord("@", "railway-verify=zz")).toEqual({ type: "TXT", name: "_railway-verify", value: "railway-verify=zz", status: null });
  });

  it("re-checks a pending domain at most once a minute", () => {
    const now = Date.parse("2026-10-31T12:00:00Z");
    expect(domainCheckDue({ custom_domain_status: "pending", custom_domain_checked_at: "2026-10-31T11:58:00Z" }, now)).toBe(true);
    expect(domainCheckDue({ custom_domain_status: "pending", custom_domain_checked_at: "2026-10-31T11:59:30Z" }, now)).toBe(false);
    expect(domainCheckDue({ custom_domain_status: "active", custom_domain_checked_at: null }, now)).toBe(false);
  });
});

describe("connecting a domain (Railway)", () => {
  let calls: Array<{ query: string; variables: Record<string, unknown> }>;
  let responses: Array<unknown>;

  function deps(over: Partial<DomainDeps> = {}): DomainDeps {
    const fetchImpl: RailwayFetch = async (_url, init) => {
      const body = JSON.parse(init.body) as { query: string; variables: Record<string, unknown> };
      calls.push(body);
      const next = responses.shift() ?? { data: {} };
      return { ok: true, status: 200, json: async () => next };
    };
    return {
      config: { token: "t", projectId: "proj", environmentId: "env", serviceId: "svc", targetPort: 8080 },
      fetch: fetchImpl,
      now: () => new Date("2026-10-31T12:00:00Z"),
      ...over,
    };
  }

  beforeEach(() => {
    seed();
    calls = [];
    responses = [];
  });

  it("adds it to the web service and stores the records to show", async () => {
    responses = [
      { data: { customDomainAvailable: { available: true } } },
      { data: { customDomainCreate: { id: "dom-1", domain: "www.acme.ca", status: { verificationToken: "tok", dnsRecords: [{ hostlabel: "www", requiredValue: "x1.up.railway.app", status: "PENDING" }] } } } },
    ];
    await connectSiteDomain(db.client, scope, "https://www.acme.ca", deps());
    expect(calls[1].variables).toEqual({ input: { domain: "www.acme.ca", projectId: "proj", environmentId: "env", serviceId: "svc", targetPort: 8080 } });
    expect(siteRow()).toMatchObject({ custom_domain: "www.acme.ca", custom_domain_ref: "dom-1", custom_domain_status: "pending" });
    expect((siteRow().custom_domain_dns as { records: unknown[] }).records).toHaveLength(2);
  });

  it("refuses without the Railway token, without a page, a second domain, or a taken one", async () => {
    await expect(connectSiteDomain(db.client, scope, "www.acme.ca", deps({ config: null }))).rejects.toThrow(/isn't switched on/);
    seed({}, null);
    await expect(connectSiteDomain(db.client, scope, "www.acme.ca", deps())).rejects.toThrow(/Create your page first/);
    seed({}, { custom_domain: "acme.ca" });
    await expect(connectSiteDomain(db.client, scope, "www.acme.ca", deps())).rejects.toThrow(/Remove the current domain/);
    seed();
    db.tables.company_sites.push({ id: "site-2", organization_id: ORG, company_id: "other", slug: "other", custom_domain: "www.acme.ca" });
    await expect(connectSiteDomain(db.client, scope, "www.acme.ca", deps())).rejects.toThrow(/another business/);
    expect(calls).toHaveLength(0);
  });

  it("Railway says it's in use elsewhere → a plain message, nothing stored", async () => {
    responses = [{ data: { customDomainAvailable: { available: false, message: "Domain is already in use" } } }];
    await expect(connectSiteDomain(db.client, scope, "www.acme.ca", deps())).rejects.toThrow(/already in use/);
    expect(siteRow().custom_domain).toBeNull();
  });

  it("check: goes live once DNS is valid; keeps showing the TXT record", async () => {
    seed({}, { custom_domain: "www.acme.ca", custom_domain_ref: "dom-1", custom_domain_status: "pending", custom_domain_dns: { records: [{ type: "TXT", name: "_railway-verify.www", value: "railway-verify=tok", status: null }], certificate: null } });
    responses = [{ data: { customDomain: { status: { certificateStatus: "ISSUED", dnsRecords: [{ hostlabel: "www", requiredValue: "x1.up.railway.app", status: "VALID" }] } } } }];
    expect(await checkSiteDomain(db.client, scope, deps())).toBe("active");
    expect(siteRow().custom_domain_status).toBe("active");
    expect((siteRow().custom_domain_dns as { records: Array<{ type: string }> }).records.map((r) => r.type)).toEqual(["CNAME", "TXT"]);
  });

  it("remove: deleted in Railway and cleared; a Railway failure doesn't trap the owner", async () => {
    seed({}, { custom_domain: "www.acme.ca", custom_domain_ref: "dom-1", custom_domain_status: "active" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const failing: RailwayFetch = async () => ({ ok: false, status: 500, json: async () => ({ errors: [{ message: "boom" }] }) });
    await removeSiteDomain(db.client, scope, deps({ fetch: failing }));
    expect(siteRow()).toMatchObject({ custom_domain: null, custom_domain_ref: null, custom_domain_status: "none" });
  });
});

describe("serving on the business's own domain", () => {
  it("only '/' on a host that isn't ours is rewritten", () => {
    expect(customDomainRewritePath("www.acme.ca", "/", null)).toBe(CUSTOM_DOMAIN_SITE_PATH);
    expect(customDomainRewritePath("quotes.a1marinecare.ca", "/", null)).toBe(CUSTOM_DOMAIN_SITE_PATH);
    expect(customDomainRewritePath("www.acme.ca", "/q/abc", null)).toBeNull();
    for (const ours of ["app.everdoer.com", "api.everdoer.com", "app.empirevu.com", "pages.everdoer.com", "localhost:3000", "x.up.railway.app", "127.0.0.1:3000"]) {
      expect(customDomainRewritePath(ours, "/", "https://pages.everdoer.com")).toBeNull();
    }
    expect(customDomainRewritePath("pages.crankleads.com", "/", "https://pages.everdoer.com", "pages.crankleads.com")).toBeNull();
  });

  it("a live connected domain gets its page (canonical on the domain, form embedded from the app)", async () => {
    seed({}, { custom_domain: "www.acme.ca", custom_domain_status: "active" });
    process.env.EVERDOER_APP_BASE_URL = "https://app.everdoer.com";
    const res = await siteGET(new Request("https://www.acme.ca/", { headers: { host: "www.acme.ca" } }), { params: { slug: "_domain" } });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<link rel="canonical" href="https://www.acme.ca/">');
    expect(html).toContain('src="https://app.everdoer.com/embed/v1.js"');
    expect(html).not.toContain('id="quote-form"');
    delete process.env.EVERDOER_APP_BASE_URL;
  });

  it("any other host (or a domain still pending) gets the app as before", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "spa-"));
    mkdirSync(path.join(dir, "public"));
    writeFileSync(path.join(dir, "public", "index.html"), "<!doctype html><div id=root></div>");
    vi.spyOn(process, "cwd").mockReturnValue(dir);
    seed({}, { custom_domain: "www.acme.ca", custom_domain_status: "pending" });
    const res = await siteGET(new Request("https://www.acme.ca/", { headers: { host: "www.acme.ca" } }), { params: { slug: "_domain" } });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-cache");
    expect(await res.text()).toBe("<!doctype html><div id=root></div>");
    const other = await siteGET(new Request("https://quotes.a1marinecare.ca/", { headers: { host: "quotes.a1marinecare.ca" } }), { params: { slug: "_domain" } });
    expect(await other.text()).toContain("id=root");
  });

  it("the public URL is the domain only once it's live", () => {
    const base = { organization_id: ORG, company_id: CO, slug: "northshore-snow" };
    expect(sitePublicUrl({ ...base, custom_domain: "www.acme.ca", custom_domain_status: "active" }, "empirevu")).toBe("https://www.acme.ca/");
    expect(sitePublicUrl({ ...base, custom_domain: "www.acme.ca", custom_domain_status: "pending" }, "empirevu")).toMatch(/\/s\/northshore-snow$/);
  });
});

describe("renderer: tab icon, gallery, embedded form", () => {
  const opts = { url: "https://www.acme.ca/", formKey: "evpk_0123456789abcdef0123456789abcdef", bookingUrl: null, turnstileSiteKey: "0x4AAA" };

  it("the tab icon wins over the logo; the logo is the fallback; none → no link", () => {
    const c = content();
    c.facts.logoUrl = "https://cdn/logo.png";
    expect(renderSitePage(c, { ...opts, faviconUrl: "https://cdn/icon.png" })).toContain('<link rel="icon" href="https://cdn/icon.png">');
    expect(renderSitePage(c, opts)).toContain('<link rel="icon" href="https://cdn/logo.png">');
    c.facts.logoUrl = null;
    expect(renderSitePage(c, opts)).not.toContain('rel="icon"');
  });

  it("photos after the first show as a gallery; one photo → no gallery", () => {
    const c = content();
    c.facts.photos = ["https://cdn/1.jpg", "https://cdn/2.jpg", "https://cdn/3.jpg"];
    const html = renderSitePage(c, opts);
    expect(html).toContain('id="photos"');
    expect(html).toContain('src="https://cdn/2.jpg"');
    c.facts.photos = ["https://cdn/1.jpg"];
    expect(renderSitePage(c, opts)).not.toContain('id="photos"');
  });

  it("embedded form: no inline form, no Turnstile script; preview keeps the inline form", () => {
    const c = content();
    const html = renderSitePage(c, { ...opts, embedFormOrigin: "https://app.everdoer.com" });
    expect(html).toContain('<script src="https://app.everdoer.com/embed/v1.js" data-form="evpk_0123456789abcdef0123456789abcdef"');
    expect(html).not.toContain("challenges.cloudflare.com");
    expect(html).not.toContain('id="quote-form"');
    expect(renderSitePage(c, { ...opts, embedFormOrigin: "https://app.everdoer.com", preview: true })).toContain('id="quote-form"');
    expect(renderSitePage(c, { ...opts, embedFormOrigin: "javascript:alert(1)" })).toContain('id="quote-form"');
  });
});
