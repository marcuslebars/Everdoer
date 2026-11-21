import { describe, expect, it, vi } from "vitest";

import { createFakeDb, type FakeDb } from "@/test/helpers/fake-supabase";

/**
 * Job photos → the website's "Our work": the owner picks a photo from a job, the server copies it
 * from the private job-photos bucket to the public site-images bucket and adds it to the page.
 */
let db: FakeDb;
let user: { id: string } | null = null;
vi.mock("@/server/supabase/admin", () => ({ createSupabaseAdminClient: () => db.client }));
vi.mock("@/server/supabase/server", () => ({
  createSupabaseServerClient: () => ({
    ...(db.client as unknown as Record<string, unknown>),
    from: (table: string) => (db.client as unknown as { from: (t: string) => unknown }).from(table),
    storage: (db.client as unknown as { storage: unknown }).storage,
    auth: {
      async getUser() {
        return user ? { data: { user }, error: null } : { data: { user: null }, error: { message: "no session" } };
      },
    },
  }),
}));

import { GET as jobPhotosGET } from "@/app/api/organizations/[organizationId]/companies/[companyId]/site/job-photos/route";
import { PATCH as imagesPATCH } from "@/app/api/organizations/[organizationId]/companies/[companyId]/site/images/route";
import { snowCompany } from "@/server/services/dfy/__fixtures__/sample-sites";
import { buildSiteFacts, factsUsed, parseSiteContent, SITE_CONTENT_VERSION, templateSiteCopy } from "@/server/services/dfy/site-content";
import { addJobPhotoToSite, jobPhotoIdsOnSite, ownImagePath, recentJobPhotosForSite, sitePathForJobPhoto } from "@/server/services/dfy/site-images";

const ORG = "11111111-1111-4111-8111-111111111111";
const CO = "22222222-2222-4222-8222-222222222222";
const scope = { organizationId: ORG, companyId: CO };
const STORAGE = "https://x.supabase.co/storage/v1/object/public/site-images/";
const photoId = (n: number) => `33333333-3333-4333-8333-${String(n).padStart(12, "0")}`;

/** Two fake buckets: objects by path; download/upload/signed URLs/public URLs. */
function fakeStorage() {
  const buckets: Record<string, Map<string, unknown>> = { "job-photos": new Map(), "site-images": new Map() };
  const api = {
    from: (name: string) => {
      const objects = buckets[name];
      return {
        download: async (p: string) => (objects.has(p) ? { data: objects.get(p), error: null } : { data: null, error: { message: "not found" } }),
        upload: async (p: string, file: unknown) => {
          objects.set(p, file);
          return { data: { path: p }, error: null };
        },
        list: async (dir: string, opts: { search: string }) => ({
          data: [...objects.keys()].filter((p) => p === `${dir}/${opts.search}`).map((p) => ({ name: p.slice(dir.length + 1) })),
          error: null,
        }),
        createSignedUrls: async (paths: string[]) => ({ data: paths.map((p) => ({ path: p, signedUrl: `https://signed/${p}` })), error: null }),
        getPublicUrl: (p: string) => ({ data: { publicUrl: `${STORAGE}${p}` } }),
        remove: async (paths: string[]) => {
          paths.forEach((p) => objects.delete(p));
          return { data: [], error: null };
        },
      };
    },
  };
  return { buckets, api };
}

let storage: ReturnType<typeof fakeStorage>;

function seed(photos: string[] = [], role = "owner") {
  const facts = buildSiteFacts(snowCompany);
  db = createFakeDb({
    organization_memberships: [{ id: "m1", organization_id: ORG, profile_id: "u1", role }],
    profiles: [{ id: "u1", email: "o@example.com" }],
    organizations: [{ id: ORG, platform_brand: "everdoer", subscription_status: "active" }],
    companies: [
      { id: CO, organization_id: ORG, name: "Northshore", brand_logo_url: null, profile: { photos } },
      { id: "other-co", organization_id: ORG, name: "Other", brand_logo_url: null, profile: {} },
    ],
    bookings: [
      { id: "b1", organization_id: ORG, company_id: CO, title: "Smith driveway" },
      { id: "b2", organization_id: ORG, company_id: CO, title: "Lee roof" },
    ],
    job_photos: [
      { id: photoId(1), organization_id: ORG, company_id: CO, booking_id: "b1", storage_path: `${ORG}/${CO}/b1/a.jpg`, taken_at: "2026-11-20T10:00:00Z" },
      { id: photoId(2), organization_id: ORG, company_id: CO, booking_id: "b2", storage_path: `${ORG}/${CO}/b2/b.jpg`, taken_at: "2026-11-21T10:00:00Z" },
      { id: photoId(9), organization_id: ORG, company_id: "other-co", booking_id: "bx", storage_path: `${ORG}/other-co/bx/c.jpg`, taken_at: "2026-11-21T11:00:00Z" },
    ],
    company_sites: [
      {
        id: "site-1",
        organization_id: ORG,
        company_id: CO,
        slug: "northshore",
        status: "published",
        content: { version: SITE_CONTENT_VERSION, mode: "full", facts: { ...facts, photos }, factsUsed: factsUsed(facts), copy: templateSiteCopy(facts, "full"), generatedAt: "" },
      },
    ],
  });
  storage = fakeStorage();
  storage.buckets["job-photos"].set(`${ORG}/${CO}/b1/a.jpg`, "JPEG-A");
  storage.buckets["job-photos"].set(`${ORG}/${CO}/b2/b.jpg`, "JPEG-B");
  Object.assign(db.client, { storage: storage.api });
  user = { id: "u1" };
}

const photosOf = () => ((db.tables.companies[0] as { profile: { photos: string[] } }).profile.photos ?? []) as string[];

describe("paths", () => {
  it("a job photo's website copy is named after it, and passes the upload rules", () => {
    const p = sitePathForJobPhoto(scope, photoId(1));
    expect(p).toBe(`${ORG}/${CO}/photo-${photoId(1)}.jpg`);
    expect(ownImagePath(scope, "photo", p)).not.toBeNull();
    expect([...jobPhotoIdsOnSite([`${STORAGE}${p}`, `${STORAGE}${ORG}/${CO}/photo-abc.jpg`, "https://elsewhere/x.jpg"])]).toEqual([photoId(1)]);
  });
});

describe("adding a job photo", () => {
  it("copies it to the website bucket, adds it to the photos and the page", async () => {
    seed();
    await addJobPhotoToSite(db.client, scope, photoId(1));
    const target = `${ORG}/${CO}/photo-${photoId(1)}.jpg`;
    expect(storage.buckets["site-images"].get(target)).toBe("JPEG-A");
    expect(photosOf()).toEqual([`${STORAGE}${target}`]);
    expect(parseSiteContent(db.tables.company_sites[0].content)!.facts.photos).toEqual([`${STORAGE}${target}`]);
    // Twice is still once.
    await addJobPhotoToSite(db.client, scope, photoId(1));
    expect(photosOf()).toHaveLength(1);
  });

  it("refuses another company's photo, a bad id, and a full page", async () => {
    seed();
    await expect(addJobPhotoToSite(db.client, scope, photoId(9))).rejects.toThrow("That photo wasn't found.");
    await expect(addJobPhotoToSite(db.client, scope, "../../etc")).rejects.toThrow("That photo wasn't found.");
    seed(Array.from({ length: 6 }, (_, i) => `${STORAGE}${ORG}/${CO}/photo-${photoId(100 + i)}.jpg`));
    await expect(addJobPhotoToSite(db.client, scope, photoId(1))).rejects.toThrow("up to 6 photos");
    expect(storage.buckets["site-images"].size).toBe(0);
  });

  it("lists the latest job photos (or one job's), with titles and what's already on the page", async () => {
    seed([`${STORAGE}${ORG}/${CO}/photo-${photoId(2)}.jpg`]);
    const all = await recentJobPhotosForSite(db.client, scope);
    expect(all.map((p) => [p.id, p.jobTitle, p.onSite])).toEqual([
      [photoId(2), "Lee roof", true],
      [photoId(1), "Smith driveway", false],
    ]);
    expect(all[0].url).toBe(`https://signed/${ORG}/${CO}/b2/b.jpg`);
    expect((await recentJobPhotosForSite(db.client, scope, { bookingId: "b1" })).map((p) => p.id)).toEqual([photoId(1)]);
  });
});

describe("routes", () => {
  const ctx = { params: { organizationId: ORG, companyId: CO } };

  it("owners list and add; members can't", async () => {
    seed();
    let res = await jobPhotosGET(new Request("http://t/x"), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ hasSite: true, room: 6, photos: [{ id: photoId(2) }, { id: photoId(1) }] });

    res = await imagesPATCH(new Request("http://t/x", { method: "PATCH", body: JSON.stringify({ action: "from-job", jobPhotoId: photoId(2) }), headers: { "content-type": "application/json" } }), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).data.photos).toEqual([`${STORAGE}${ORG}/${CO}/photo-${photoId(2)}.jpg`]);

    expect((await imagesPATCH(new Request("http://t/x", { method: "PATCH", body: JSON.stringify({ action: "from-job", jobPhotoId: "nope" }), headers: { "content-type": "application/json" } }), ctx)).status).toBe(400);

    seed([], "member");
    expect((await jobPhotosGET(new Request("http://t/x"), ctx)).status).toBe(403);
  });
});
