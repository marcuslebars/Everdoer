/**
 * Your website: logo, photos and tab icon (site-images.ts), the business's own domain
 * (site-domain.ts), serving a page on that domain (site-host.ts, /s/[slug] route), and the
 * renderer's favicon, gallery and embedded form.
 */
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
  readHostname,
  recordName,
  removeSiteDomain,
  type DomainDeps,
  type ApiFetch,
} from "@/server/services/dfy/site-domain";
import { edgeSiteHost } from "@/server/services/dfy/site-host";
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
    companies: [{ id: CO, organization_id: ORG, name: "Northshore Snow", brand_logo_url: null, profile: {}, updated_at: "2026-10-31T11:00:00.000Z", ...company }],
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
            custom_domain_added_at: null,
            updated_at: "2026-10-31T12:00:00.000Z",
            ...site,
          },
        ]
      : [],
    public_form_keys: [{ id: "k1", allowed_origins: [], organization_id: ORG, company_id: CO, public_key: "evpk_0123456789abcdef0123456789abcdef", form_type: "quote", active: true, created_at: "2026-10-01T00:00:00Z" }],
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
    expect(normalizeDomain("xn--caf-dma.ca")).toBe("xn--caf-dma.ca");
  });

  it("refuses non-domains and our own", () => {
    for (const bad of ["", "acme", "acme..ca", "-acme.ca", "http://", "1.2.3.4", "app.everdoer.com", "sites.everdoer.com", "x.up.railway.app", "acme.example.com"]) {
      expect(() => normalizeDomain(bad)).toThrow();
    }
  });

  it("the DNS Name field: '@' for the root, else the part before the domain", () => {
    expect(recordName("acme.ca")).toBe("@");
    expect(recordName("www.acme.ca")).toBe("www");
    expect(recordName("shop.www.acme.ca")).toBe("shop.www");
    expect(recordName("acme.co.uk")).toBe("@");
    expect(recordName("www.acme.co.uk")).toBe("www");
  });

  it("Cloudflare state → the CNAME to our target; live only when the hostname and certificate are active", () => {
    const pending = readHostname("www.acme.ca", "sites.everdoer.com", { id: "h1", hostname: "www.acme.ca", status: "pending", ssl: { status: "pending_validation" } });
    expect(pending.active).toBe(false);
    expect(pending.dns.records).toEqual([{ type: "CNAME", name: "www", value: "sites.everdoer.com", status: null }]);
    expect(readHostname("www.acme.ca", "sites.everdoer.com", { id: "h1", hostname: "www.acme.ca", status: "active", ssl: { status: "pending_validation" } }).active).toBe(false);
    const live = readHostname("www.acme.ca", "sites.everdoer.com", { id: "h1", hostname: "www.acme.ca", status: "active", ssl: { status: "active" } });
    expect(live.active).toBe(true);
    expect(live.dns.records[0].status).toBe("VALID");
  });

  it("passes Cloudflare's explanation on while it isn't live", () => {
    const r = readHostname("www.acme.ca", "sites.everdoer.com", { id: "h1", hostname: "www.acme.ca", status: "pending", verification_errors: ["custom hostname does not CNAME to this zone."], ssl: { status: "pending_validation" } });
    expect(r.dns.problem).toMatch(/does not CNAME/);
  });

  it("re-checks a pending domain at most once a minute, a live one every six hours", () => {
    const now = Date.parse("2026-10-31T12:00:00Z");
    expect(domainCheckDue({ custom_domain_status: "pending", custom_domain_checked_at: "2026-10-31T11:58:00Z" }, now)).toBe(true);
    expect(domainCheckDue({ custom_domain_status: "pending", custom_domain_checked_at: "2026-10-31T11:59:30Z" }, now)).toBe(false);
    expect(domainCheckDue({ custom_domain_status: "active", custom_domain_checked_at: "2026-10-31T09:00:00Z" }, now)).toBe(false);
    expect(domainCheckDue({ custom_domain_status: "active", custom_domain_checked_at: "2026-10-31T05:00:00Z" }, now)).toBe(true);
    expect(domainCheckDue({ custom_domain_status: "none", custom_domain_checked_at: null }, now)).toBe(false);
  });
});

describe("connecting a domain (Cloudflare for SaaS)", () => {
  let calls: Array<{ method: string; url: string; body: unknown }>;
  /** Replies keyed "METHOD path-suffix" (matched by the first key the URL ends with / contains). */
  let replies: Array<{ match: (method: string, url: string) => boolean; status?: number; body: unknown }>;
  let txt: Record<string, string[]>;

  function deps(over: Partial<DomainDeps> = {}): DomainDeps {
    const fetchImpl: ApiFetch = async (url, init) => {
      calls.push({ method: init.method, url, body: init.body ? JSON.parse(init.body) : undefined });
      const r = replies.find((x) => x.match(init.method, url));
      const status = r?.status ?? 200;
      return { ok: status < 400, status, json: async () => r?.body ?? { success: true, result: null } };
    };
    return {
      config: { token: "t", zoneId: "zone", target: "sites.everdoer.com" },
      fetch: fetchImpl,
      now: () => new Date("2026-10-31T12:00:00Z"),
      resolveTxt: async (name) => txt[name] ?? [],
      newToken: () => "tok123",
      ...over,
    };
  }
  const reply = (method: string, contains: string, body: unknown, status?: number) => ({ match: (m: string, u: string) => m === method && u.includes(contains), body, status });
  const ok = (result: unknown) => ({ success: true, result });
  const ops = () => calls.map((c) => `${c.method} ${c.url.replace("https://api.cloudflare.com/client/v4/zones/zone", "")}`);

  beforeEach(() => {
    seed();
    calls = [];
    txt = {};
    replies = [
      reply("GET", "/custom_hostnames?hostname=", ok([])),
      reply("POST", "/custom_hostnames", ok({ id: "h1", hostname: "www.acme.ca", status: "pending", ssl: { status: "initializing" } })),
    ];
  });

  it("adds a custom hostname (HTTP validation) and stores the one CNAME to show", async () => {
    await connectSiteDomain(db.client, scope, "https://www.acme.ca", deps());
    expect(ops()).toEqual(["GET /custom_hostnames?hostname=www.acme.ca", "POST /custom_hostnames"]);
    expect(calls[1].body).toEqual({ hostname: "www.acme.ca", ssl: { method: "http", type: "dv", settings: { min_tls_version: "1.2" } } });
    expect(siteRow()).toMatchObject({ custom_domain: "www.acme.ca", custom_domain_ref: "h1", custom_domain_status: "pending", custom_domain_added_at: "2026-10-31T12:00:00.000Z" });
    expect((siteRow().custom_domain_dns as { records: unknown[] }).records).toEqual([
      { type: "CNAME", name: "www", value: "sites.everdoer.com", status: null },
      { type: "TXT", name: "_everdoer-verify.www", value: "everdoer-verify=tok123", status: null },
    ]);
  });

  it("already on our zone (a lost reply) → taken over and checked; still needs our ownership record", async () => {
    replies.unshift(reply("GET", "/custom_hostnames?hostname=", ok([{ id: "h-old", hostname: "www.acme.ca", status: "pending", ssl: { status: "pending_validation" } }])));
    replies.unshift(reply("GET", "/custom_hostnames/h-old", ok({ id: "h-old", hostname: "www.acme.ca", status: "active", ssl: { status: "active" } })));
    await connectSiteDomain(db.client, scope, "www.acme.ca", deps());
    expect(ops()).not.toContain("POST /custom_hostnames");
    // Routed by Cloudflare (someone's CNAME is still there), but not proven ours: not live.
    expect(siteRow()).toMatchObject({ custom_domain_ref: "h-old", custom_domain_status: "pending" });
    txt["_everdoer-verify.www.acme.ca"] = ["everdoer-verify=tok123"];
    expect(await checkSiteDomain(db.client, scope, deps())).toBe("active");
  });

  it("refuses without Cloudflare set up, without a page, a second domain, a taken one, or past the cap", async () => {
    await expect(connectSiteDomain(db.client, scope, "www.acme.ca", deps({ config: null }))).rejects.toThrow(/isn't switched on/);
    seed({}, null);
    await expect(connectSiteDomain(db.client, scope, "www.acme.ca", deps())).rejects.toThrow(/Create your page first/);
    seed({}, { custom_domain: "acme.ca" });
    await expect(connectSiteDomain(db.client, scope, "www.acme.ca", deps())).rejects.toThrow(/Remove the current domain/);
    seed();
    db.tables.company_sites.push({ id: "site-2", organization_id: ORG, company_id: "other", slug: "other", custom_domain: "www.acme.ca" });
    await expect(connectSiteDomain(db.client, scope, "www.acme.ca", deps())).rejects.toThrow(/another business/);
    process.env.SITE_DOMAINS_MAX = "1";
    await expect(connectSiteDomain(db.client, scope, "www.other.ca", deps())).rejects.toThrow(/can't connect more domains/);
    delete process.env.SITE_DOMAINS_MAX;
    expect(calls).toHaveLength(0);
  });

  it("Cloudflare refuses the hostname → its reason, nothing stored", async () => {
    replies.unshift(reply("POST", "/custom_hostnames", { success: false, errors: [{ code: 1414, message: "Hostname is a blocked or reserved domain." }] }, 400));
    await expect(connectSiteDomain(db.client, scope, "www.acme.ca", deps())).rejects.toThrow(/can't be added: Hostname is a blocked/);
    expect(siteRow().custom_domain).toBeNull();
  });

  it("the site's form, if limited to listed websites, gets the domain added", async () => {
    db.tables.public_form_keys[0] = { ...(db.tables.public_form_keys[0] as object), allowed_origins: ["https://acme-old.ca"] };
    await connectSiteDomain(db.client, scope, "www.acme.ca", deps());
    expect((db.tables.public_form_keys[0] as { allowed_origins: string[] }).allowed_origins).toEqual(["https://acme-old.ca", "https://www.acme.ca"]);
  });

  const pendingDns = { records: [], certificate: null, token: "tok123" };

  it("check: live once ownership is proven and hostname + certificate are active (and stays proven)", async () => {
    seed({}, { custom_domain: "www.acme.ca", custom_domain_ref: "h1", custom_domain_status: "pending", custom_domain_added_at: "2026-10-31T10:00:00Z", custom_domain_dns: pendingDns });
    replies = [reply("GET", "/custom_hostnames/h1", ok({ id: "h1", hostname: "www.acme.ca", status: "active", ssl: { status: "active" } }))];
    expect(await checkSiteDomain(db.client, scope, deps())).toBe("pending"); // no TXT yet
    txt["_everdoer-verify.www.acme.ca"] = ['"everdoer-verify=tok123"'.replace(/"/g, "")];
    expect(await checkSiteDomain(db.client, scope, deps())).toBe("active");
    const dns = siteRow().custom_domain_dns as { verifiedAt: string; liveSince: string; records: Array<{ type: string; status: string | null }> };
    expect(dns.verifiedAt).toBeTruthy();
    expect(dns.liveSince).toBe("2026-10-31T12:00:00.000Z");
    expect(dns.records.map((r) => `${r.type}:${r.status}`)).toEqual(["CNAME:VALID", "TXT:VALID"]);
    txt = {}; // the owner removes the TXT later: still theirs
    expect(await checkSiteDomain(db.client, scope, deps())).toBe("active");
  });

  it("check: not live yet → asks Cloudflare to validate again now (no-change PATCH)", async () => {
    seed({}, { custom_domain: "www.acme.ca", custom_domain_ref: "h1", custom_domain_status: "pending", custom_domain_added_at: "2026-10-31T10:00:00Z", custom_domain_dns: pendingDns });
    replies = [reply("GET", "/custom_hostnames/h1", ok({ id: "h1", hostname: "www.acme.ca", status: "pending", ssl: { status: "pending_validation" } }))];
    await checkSiteDomain(db.client, scope, deps());
    expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ ssl: { method: "http", type: "dv", settings: { min_tls_version: "1.2" } } });
  });

  it("a live domain stays live while its certificate renews or Cloudflare redeploys it", async () => {
    const live = { ...pendingDns, verifiedAt: "2026-09-01T00:00:00Z", liveSince: "2026-09-01T00:00:00Z" };
    seed({}, { custom_domain: "www.acme.ca", custom_domain_ref: "h1", custom_domain_status: "active", custom_domain_added_at: "2026-09-01T00:00:00Z", custom_domain_dns: live });
    replies = [reply("GET", "/custom_hostnames/h1", ok({ id: "h1", hostname: "www.acme.ca", status: "active_redeploying", ssl: { status: "pending_validation" } }))];
    expect(await checkSiteDomain(db.client, scope, deps())).toBe("active");
  });

  it("a once-live domain that drops to pending is never released by the 7-day rule", async () => {
    const live = { ...pendingDns, verifiedAt: "2026-09-01T00:00:00Z", liveSince: "2026-09-01T00:00:00Z" };
    seed({}, { custom_domain: "www.acme.ca", custom_domain_ref: "h1", custom_domain_status: "pending", custom_domain_added_at: "2026-09-01T00:00:00Z", custom_domain_dns: live });
    replies = [reply("GET", "/custom_hostnames/h1", ok({ id: "h1", hostname: "www.acme.ca", status: "moved", ssl: { status: "active" } }))];
    expect(await checkSiteDomain(db.client, scope, deps())).toBe("pending");
    expect(ops()).not.toContain("DELETE /custom_hostnames/h1");
    expect(siteRow().custom_domain).toBe("www.acme.ca");
  });

  it("check: still waiting after a week → released", async () => {
    seed({}, { custom_domain: "www.acme.ca", custom_domain_ref: "h1", custom_domain_status: "pending", custom_domain_added_at: "2026-10-20T10:00:00Z" });
    expect(await checkSiteDomain(db.client, scope, deps())).toBe("none");
    expect(ops()).toEqual(["DELETE /custom_hostnames/h1"]);
    expect(siteRow()).toMatchObject({ custom_domain: null, custom_domain_status: "none" });
  });

  it("check: gone from Cloudflare → back to waiting with no records", async () => {
    seed({}, { custom_domain: "www.acme.ca", custom_domain_ref: "h1", custom_domain_status: "active" });
    replies = [reply("GET", "/custom_hostnames/h1", { success: false, errors: [{ code: 1436, message: "The custom hostname was not found." }] }, 404)];
    expect(await checkSiteDomain(db.client, scope, deps())).toBe("pending");
    expect((siteRow().custom_domain_dns as { records: unknown[] }).records).toEqual([]);
  });

  it("check racing a reconnect doesn't touch the new domain", async () => {
    seed({}, { custom_domain: "www.acme.ca", custom_domain_ref: "h1", custom_domain_status: "pending", custom_domain_added_at: "2026-10-31T10:00:00Z" });
    txt["_everdoer-verify.www.acme.ca"] = ["everdoer-verify=tok123"];
    replies = [reply("GET", "/custom_hostnames/h1", ok({ id: "h1", hostname: "www.acme.ca", status: "active", ssl: { status: "active" } }))];
    const d = deps();
    const slow: ApiFetch = async (url, init) => {
      Object.assign(siteRow(), { custom_domain: "www.new.ca", custom_domain_ref: "h2", custom_domain_status: "pending" });
      return d.fetch(url, init);
    };
    await checkSiteDomain(db.client, scope, { ...d, fetch: slow });
    expect(siteRow()).toMatchObject({ custom_domain: "www.new.ca", custom_domain_ref: "h2", custom_domain_status: "pending" });
  });

  it("remove: deleted on Cloudflare and cleared; a failure keeps it; already gone is fine", async () => {
    seed({}, { custom_domain: "www.acme.ca", custom_domain_ref: "h1", custom_domain_status: "active" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    replies = [reply("DELETE", "/custom_hostnames/h1", { success: false, errors: [{ message: "boom" }] }, 500)];
    await expect(removeSiteDomain(db.client, scope, deps())).rejects.toThrow(/Try again/);
    expect(siteRow().custom_domain).toBe("www.acme.ca");
    replies = [reply("DELETE", "/custom_hostnames/h1", { success: false, errors: [{ code: 1436, message: "not found" }] }, 404)];
    await removeSiteDomain(db.client, scope, deps());
    expect(siteRow()).toMatchObject({ custom_domain: null, custom_domain_ref: null, custom_domain_status: "none" });
  });

  it("Cloudflare hanging or down → 'try again', not a crash", async () => {
    seed({}, { custom_domain: "www.acme.ca", custom_domain_ref: "h1", custom_domain_status: "pending", custom_domain_added_at: "2026-10-31T10:00:00Z" });
    const down: ApiFetch = async () => {
      throw new Error("The operation was aborted due to timeout");
    };
    await expect(checkSiteDomain(db.client, scope, deps({ fetch: down }))).rejects.toThrow(/couldn't reach/);
  });
});

describe("serving on the business's own domain (via the sites-edge Worker)", () => {
  const KEY = "k".repeat(32);
  const edgeRequest = (host: string, key = KEY) =>
    new Request("https://app.everdoer.com/s/_domain", { headers: { "x-everdoer-site-host": host, "x-everdoer-edge-key": key } });

  afterEach(() => {
    delete process.env.SITES_EDGE_KEY;
    delete process.env.EVERDOER_APP_BASE_URL;
  });

  it("trusts the domain header only with the right key", () => {
    const h = (o: Record<string, string>) => new Headers(o);
    expect(edgeSiteHost(h({ "x-everdoer-site-host": "WWW.Acme.ca.", "x-everdoer-edge-key": KEY }), KEY)).toBe("www.acme.ca");
    expect(edgeSiteHost(h({ "x-everdoer-site-host": "www.acme.ca", "x-everdoer-edge-key": "wrong".repeat(7) }), KEY)).toBeNull();
    expect(edgeSiteHost(h({ "x-everdoer-site-host": "www.acme.ca" }), KEY)).toBeNull();
    expect(edgeSiteHost(h({ "x-everdoer-site-host": "www.acme.ca", "x-everdoer-edge-key": "short" }), "short")).toBeNull();
    expect(edgeSiteHost(h({ "x-everdoer-site-host": "bad host/<x>", "x-everdoer-edge-key": KEY }), KEY)).toBeNull();
  });

  it("a live connected domain gets its page: canonical on the domain, form embedded from the app, varies by domain", async () => {
    process.env.SITES_EDGE_KEY = KEY;
    process.env.EVERDOER_APP_BASE_URL = "https://app.everdoer.com";
    seed({}, { custom_domain: "www.acme.ca", custom_domain_status: "active" });
    const res = await siteGET(edgeRequest("www.acme.ca"), { params: { slug: "_domain" } });
    expect(res.status).toBe(200);
    expect(res.headers.get("vary")).toBe("x-everdoer-site-host");
    const html = await res.text();
    expect(html).toContain('<link rel="canonical" href="https://www.acme.ca/">');
    expect(html).toContain('src="https://app.everdoer.com/embed/v1.js"');
    expect(html).not.toContain('id="quote-form"');
  });

  it("wrong key, a pending domain, or no header → the neutral 404", async () => {
    process.env.SITES_EDGE_KEY = KEY;
    seed({}, { custom_domain: "www.acme.ca", custom_domain_status: "active" });
    expect((await siteGET(edgeRequest("www.acme.ca", "x".repeat(32)), { params: { slug: "_domain" } })).status).toBe(404);
    expect((await siteGET(new Request("https://app.everdoer.com/s/_domain"), { params: { slug: "_domain" } })).status).toBe(404);
    seed({}, { custom_domain: "www.acme.ca", custom_domain_status: "pending" });
    expect((await siteGET(edgeRequest("www.acme.ca"), { params: { slug: "_domain" } })).status).toBe(404);
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
