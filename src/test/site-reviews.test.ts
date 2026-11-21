import { afterEach, describe, expect, it, vi } from "vitest";

import { createFakeDb, type FakeDb } from "@/test/helpers/fake-supabase";

/**
 * Live Google reviews on generated sites (docs/done-for-you.md → "Generated sites" → "Google
 * reviews"): fetched when the section scrolls into view, never stored, capped before the call.
 */
let db: FakeDb;
vi.mock("@/server/supabase/admin", () => ({ createSupabaseAdminClient: () => db.client }));

import { GET as reviewsGET } from "@/app/api/public/sites/reviews/route";
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
import { renderSitePage } from "@/server/services/dfy/site-render";
import { fetchPlaceReviews, mapPlaceReviews, sitePlaceForReviews, type ReviewsFetch } from "@/server/services/dfy/site-reviews";

const PLACE = "ChIJN1t_tDeuEmsRUsoyG83frY4";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Safari/605.1.15";

function googleAnswer(n = 6) {
  return {
    rating: 4.8,
    userRatingCount: 63,
    googleMapsUri: "https://maps.google.com/?cid=123",
    reviews: [
      { rating: 5, text: { text: "" }, authorAttribution: { displayName: "Empty" } },
      ...Array.from({ length: n }, (_, i) => ({
        rating: i === 1 ? 2 : 5,
        relativePublishTimeDescription: `${i + 1} weeks ago`,
        text: { text: `Great plowing ${i}` },
        authorAttribution: { displayName: `Reviewer ${i}`, uri: `https://www.google.com/maps/contrib/${i}`, photoUri: `https://lh3.googleusercontent.com/a/${i}` },
      })),
    ],
  };
}

/** Built through the reader, so the fixture doesn't depend on which other content fields exist. */
function content(sections = parseSiteSections(null)): SiteContent {
  const facts = buildSiteFacts(snowCompany);
  return parseSiteContent({
    version: SITE_CONTENT_VERSION,
    mode: "full",
    facts,
    factsUsed: factsUsed(facts),
    copy: templateSiteCopy(facts, "full"),
    copySource: "template",
    settings: { showPrices: true, theme: "auto", color: null, sections, pages: defaultSitePagesSettings() },
    generatedAt: "2026-11-21T12:00:00.000Z",
  })!;
}

function seed(site: Record<string, unknown> = {}, placeId: string | null = PLACE, limitTrips: string[] = []) {
  db = createFakeDb({
    companies: [{ id: "c1", organization_id: "org-1", google_place_id: placeId }],
    company_sites: [{ id: "site-1", organization_id: "org-1", company_id: "c1", slug: "northshore", status: "published", content: content(), ...site }],
  });
  db.onRpc((name, args) => (name === "consume_rate_limit" ? { data: !limitTrips.some((scope) => String(args.p_key).startsWith(scope)), error: null } : { data: null, error: null }));
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("reading Google's answer", () => {
  it("keeps up to five reviews with text, in Google's order, stars included (never filtered)", () => {
    const out = mapPlaceReviews(googleAnswer());
    expect(out).toMatchObject({ rating: 4.8, count: 63, mapsUrl: "https://maps.google.com/?cid=123" });
    expect(out.reviews).toHaveLength(5);
    expect(out.reviews.map((r) => r.author)).toEqual(["Reviewer 0", "Reviewer 1", "Reviewer 2", "Reviewer 3", "Reviewer 4"]);
    expect(out.reviews[1].rating).toBe(2);
    expect(out.reviews[0]).toMatchObject({ authorUrl: "https://www.google.com/maps/contrib/0", authorPhoto: "https://lh3.googleusercontent.com/a/0", when: "1 weeks ago" });
  });

  it("only Google links survive; odd values are made safe", () => {
    const out = mapPlaceReviews({
      googleMapsUri: "javascript:alert(1)",
      reviews: [{ rating: 9, text: { text: " x " }, authorAttribution: { displayName: "", uri: "https://evil.example/u", photoUri: "http://lh3.googleusercontent.com/a" } }],
    });
    expect(out.mapsUrl).toBeNull();
    expect(out.reviews[0]).toEqual({ rating: 5, text: "x", author: "A Google user", authorUrl: null, authorPhoto: null, when: null });
    expect(mapPlaceReviews(null)).toEqual({ rating: null, count: null, mapsUrl: null, reviews: [] });
  });

  it("asks Google with the reviews field mask; no key, a bad id or a failure is just 'nothing'", async () => {
    const fetch = vi.fn<ReviewsFetch>(async () => ({ ok: true, status: 200, json: async () => googleAnswer(2) }));
    expect(await fetchPlaceReviews(PLACE, { apiKey: null, fetch })).toBeNull();
    expect(await fetchPlaceReviews("not a place", { apiKey: "k", fetch })).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    expect((await fetchPlaceReviews(PLACE, { apiKey: "k", fetch }))!.reviews).toHaveLength(2);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(`https://places.googleapis.com/v1/places/${PLACE}?languageCode=en&regionCode=CA`);
    expect(init.headers["X-Goog-FieldMask"]).toBe("reviews,rating,userRatingCount,googleMapsUri");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(await fetchPlaceReviews(PLACE, { apiKey: "k", fetch: async () => ({ ok: false, status: 403, json: async () => ({}) }) })).toBeNull();
    expect(await fetchPlaceReviews(PLACE, { apiKey: "k", fetch: async () => { throw new Error("down"); } })).toBeNull();
  });
});

describe("which sites get them", () => {
  it("published sites with the reviews section showing and a Google listing", async () => {
    seed();
    expect(await sitePlaceForReviews("Northshore")).toEqual({ placeId: PLACE, siteId: "site-1" });
    seed({ status: "draft" });
    expect(await sitePlaceForReviews("northshore")).toBeNull();
    seed({ content: content(parseSiteSections([{ id: "reviews", hidden: true }])) });
    expect(await sitePlaceForReviews("northshore")).toBeNull();
    seed({}, null);
    expect(await sitePlaceForReviews("northshore")).toBeNull();
    expect(await sitePlaceForReviews("../x")).toBeNull();
  });
});

describe("the public route", () => {
  const get = (slug: string, ua: string | null = UA) => reviewsGET(new Request(`http://t/api/public/sites/reviews?s=${slug}`, { headers: ua ? { "user-agent": ua } : {} }));

  it("passes Google's reviews straight through, never cacheable", async () => {
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "k");
    seed();
    const google = vi.fn(async () => new Response(JSON.stringify(googleAnswer(3)), { status: 200 }));
    vi.stubGlobal("fetch", google);
    const res = await get("northshore");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    const body = await res.json();
    expect(body.data.reviews).toHaveLength(3);
    expect(google).toHaveBeenCalledTimes(1);
  });

  it("caps and bots stop it BEFORE the billed Google call", async () => {
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "k");
    const google = vi.fn(async () => new Response(JSON.stringify(googleAnswer()), { status: 200 }));
    vi.stubGlobal("fetch", google);

    seed({}, PLACE, ["site_reviews_site_day"]);
    expect((await (await get("northshore")).json()).data).toBeNull();
    seed({}, PLACE, ["site_reviews_month"]);
    expect((await (await get("northshore")).json()).data).toBeNull();
    seed({}, PLACE, ["site_reviews_ip"]);
    expect((await (await get("northshore")).json()).data).toBeNull();
    seed();
    vi.stubEnv("SITE_REVIEWS_MONTHLY_CAP", "0");
    expect((await (await get("northshore")).json()).data).toBeNull();
    vi.stubEnv("SITE_REVIEWS_MONTHLY_CAP", "");
    expect((await (await get("northshore", "Googlebot/2.1")).json()).data).toBeNull();
    expect((await (await get("nope")).json()).data).toBeNull();
    expect(google).not.toHaveBeenCalled();
  });
});

describe("on the page", () => {
  const opts = { url: "https://pages.everdoer.com/northshore", formKey: "evpk_0123456789abcdef0123456789abcdef", bookingUrl: null, turnstileSiteKey: null, creditUrl: null };
  const reviews = { endpoint: "https://app.everdoer.com/api/public/sites/reviews", slug: "northshore" };

  it("a lazy block with Google Maps credit and policy links when set up; nothing extra otherwise", () => {
    const html = renderSitePage(content(), { ...opts, reviews });
    expect(html).toContain("data-gr hidden");
    expect(html).toContain('<span class="gr-g">Google Maps</span>');
    expect(html).toContain("https://policies.google.com/privacy");
    expect(html).toContain('"u":"https://app.everdoer.com/api/public/sites/reviews","s":"northshore"');
    expect(html).toContain("IntersectionObserver");
    // Review text is only ever set with textContent.
    expect(html).not.toMatch(/innerHTML/);
    expect(renderSitePage(content(), opts)).not.toContain("data-gr");
  });

  it("every inline script on the page is valid JavaScript", () => {
    const html = renderSitePage(content(), { ...opts, reviews, stats: { endpoint: "https://app.everdoer.com/api/public/sites/hit", slug: "northshore" } });
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    expect(scripts.length).toBeGreaterThanOrEqual(3);
    for (const code of scripts) expect(() => new Function(code)).not.toThrow();
  });

  it("the preview says where reviews will show, and calls nobody", () => {
    const html = renderSitePage(content(), { ...opts, reviews, preview: true });
    expect(html).toContain("Your latest Google reviews show here on the live page.");
    expect(html).not.toContain("data-gr");
  });

  it("a hostile slug can't break out of the script", () => {
    const html = renderSitePage(content(), { ...opts, reviews: { endpoint: reviews.endpoint, slug: "</script><script>alert(1)" } });
    expect(html).not.toContain("</script><script>alert(1)");
  });
});
