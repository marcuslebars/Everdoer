import { beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeDb, type FakeDb } from "@/test/helpers/fake-supabase";

/**
 * Owner editing on generated sites: section order/visibility, service lines, questions, steps,
 * and "rewrite with a note" (docs/done-for-you.md → "Generated sites" → "Owner editing").
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

import { PATCH, POST } from "@/app/api/organizations/[organizationId]/companies/[companyId]/site/route";
import { snowCompany } from "@/server/services/dfy/__fixtures__/sample-sites";
import {
  buildSiteFacts,
  copywriterFacts,
  defaultSiteSteps,
  effectiveCopy,
  factsUsed,
  parseSiteContent,
  parseSiteSections,
  defaultSitePagesSettings,
  screenSiteCopy,
  SITE_CONTENT_VERSION,
  SITE_SECTION_IDS,
  templateSiteCopy,
  type SiteContent,
  type SiteCopyModelOutput,
} from "@/server/services/dfy/site-content";
import { generateSite, updateSiteEdits, type SiteGeneratorDeps } from "@/server/services/dfy/site-generator";
import { renderSitePage } from "@/server/services/dfy/site-render";

const ORG = "org-1";
const usage = { responseId: "r1", model: "m", usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 } };
const opts = { url: "https://pages.crankleads.com/northshore", formKey: "evpk_0123456789abcdef0123456789abcdef", bookingUrl: null, turnstileSiteKey: null, creditUrl: null };

function content(patch: Partial<SiteContent> = {}): SiteContent {
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
    settings: { showPrices: true, theme: "auto", color: null, sections: parseSiteSections(null), pages: defaultSitePagesSettings() },
    copyNote: null,
    generatedAt: "2026-11-21T12:00:00.000Z",
    ...patch,
  };
}

/** Where each section's heading first appears in the page (-1 = not on the page). */
function positions(html: string) {
  return {
    services: html.indexOf('id="services-title"'),
    steps: html.indexOf('id="how-title"'),
    about: html.indexOf('id="about-title"'),
    reviews: html.indexOf('id="reviews-title"'),
    faqs: html.indexOf('id="faq-title"'),
    quote: html.indexOf('id="quote-title"'),
  };
}

describe("sections", () => {
  it("parses defensively: unknown and repeated ids dropped, missing ones added at the end", () => {
    expect(parseSiteSections(null).map((s) => s.id)).toEqual([...SITE_SECTION_IDS]);
    const parsed = parseSiteSections([{ id: "faqs", hidden: true }, { id: "nope" }, { id: "faqs" }, "x", { id: "services", hidden: "yes" }]);
    expect(parsed.slice(0, 2)).toEqual([
      { id: "faqs", hidden: true },
      { id: "services", hidden: false },
    ]);
    expect(parsed.map((s) => s.id).sort()).toEqual([...SITE_SECTION_IDS].sort());
  });

  it("the page follows the owner's order, drops hidden sections, and keeps the quote form last", () => {
    const base = positions(renderSitePage(content(), opts));
    expect(base.services).toBeLessThan(base.steps);
    expect(base.faqs).toBeLessThan(base.quote);

    const sections = parseSiteSections([{ id: "faqs", hidden: false }, { id: "reviews", hidden: false }, { id: "services", hidden: false }, { id: "steps", hidden: true }]);
    const html = renderSitePage(content({ settings: { ...content().settings, sections } }), opts);
    const p = positions(html);
    expect(p.faqs).toBeGreaterThan(-1);
    expect(p.faqs).toBeLessThan(p.reviews);
    expect(p.reviews).toBeLessThan(p.services);
    expect(p.steps).toBe(-1);
    expect(p.quote).toBeGreaterThan(Math.max(p.faqs, p.reviews, p.services, p.about));
  });

  it("a price page never shows the steps, whatever the order", () => {
    const html = renderSitePage(content({ mode: "price_page" }), opts);
    expect(positions(html).steps).toBe(-1);
  });
});

describe("owner wording", () => {
  it("service lines, questions and steps override ours; an empty question list hides the section", () => {
    const c = content({
      edits: {
        serviceBlurbs: { roof_snow: "We clear roofs before the ice dams start." },
        faqs: [{ question: "Do you do cottages?", answer: "Yes, around Barrie." }],
        steps: [
          { title: "Call Dave", text: "He picks up." },
          { title: "Done", text: "Plowed by 7am." },
        ],
      },
    });
    const copy = effectiveCopy(c);
    expect(copy.serviceBlurbs.roof_snow).toBe("We clear roofs before the ice dams start.");
    expect(copy.faqs).toEqual([{ question: "Do you do cottages?", answer: "Yes, around Barrie." }]);
    const html = renderSitePage(c, opts);
    expect(html).toContain("We clear roofs before the ice dams start.");
    expect(html).toContain("Do you do cottages?");
    expect(html).toContain("<h3>Call Dave</h3><p>He picks up.</p>");
    expect(html).not.toContain("Tell us about the job");

    const noQuestions = renderSitePage(content({ edits: { faqs: [] } }), opts);
    expect(positions(noQuestions).faqs).toBe(-1);
  });

  it("owner text is escaped like everything else", () => {
    const html = renderSitePage(content({ edits: { steps: [{ title: "<script>x</script>", text: "a & b" }, { title: "Two", text: "t" }] } }), opts);
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("&lt;script&gt;x&lt;/script&gt;");
  });

  it("our steps follow what the page offers", () => {
    expect(defaultSiteSteps({ phone: true, form: true, anyPrice: true, booking: true }).map((s) => s.title)).toEqual(["Tell us about the job", "Get your price", "Book a time"]);
    expect(defaultSiteSteps({ phone: false, form: true, anyPrice: false, booking: false })[0].text).toBe("Send a request with the form below.");
  });

  it("bad saved edits are ignored rather than breaking the page", () => {
    const parsed = parseSiteContent({ ...content(), edits: { faqs: "nope", steps: [{ title: "only one", text: "x" }], serviceBlurbs: { a: 5, b: "  " } } })!;
    expect(parsed.edits.faqs).toBeUndefined();
    expect(parsed.edits.steps).toBeUndefined();
    expect(parsed.edits.serviceBlurbs).toEqual({});
    expect(parseSiteContent({ ...content(), copyNote: "   " })!.copyNote).toBeNull();
  });
});

describe("the owner's note to the writer", () => {
  const facts = buildSiteFacts(snowCompany);
  const model: SiteCopyModelOutput = {
    headline: "Snow removal in Barrie",
    subhead: "We answer 24/7 emergency calls all winter.",
    about: "Northshore Snow & Property plows, salts and shovels driveways and small lots across south Barrie.",
    serviceBlurbs: [],
    faqs: [
      { question: "What areas do you serve?", answer: "Barrie, Innisfil and Oro-Medonte." },
      { question: "Can I book online?", answer: "Yes. Tap Book online." },
      { question: "How do I get a quote?", answer: "Use the form on this page." },
    ],
  };

  it("goes to the writer only when set", () => {
    expect(copywriterFacts(facts, "full")).not.toHaveProperty("ownerNote");
    expect(copywriterFacts(facts, "full", "Make it friendlier")).toMatchObject({ ownerNote: "Make it friendlier" });
  });

  it("vouches for what it states, and nothing else", () => {
    // Without the note, "24/7" and "emergency" are unsupported and the subhead falls back.
    const plain = screenSiteCopy(model, facts, "full");
    expect(plain.copy.subhead).not.toContain("24/7");
    expect(plain.notes.join(" ")).toContain("subhead");

    const noted = screenSiteCopy(model, facts, "full", "We take 24/7 emergency calls all winter.");
    expect(noted.copy.subhead).toBe("We answer 24/7 emergency calls all winter.");

    // A note about one thing doesn't open the door to another.
    const insured = screenSiteCopy({ ...model, subhead: "Fully insured and here 24/7." }, facts, "full", "We take 24/7 emergency calls.");
    expect(insured.copy.subhead).not.toContain("insured");
  });
});

// ── Generator + routes ──────────────────────────────────────────────────────

function seed(role: string | null = "owner") {
  db = createFakeDb(
    {
      organization_memberships: role ? [{ id: "m1", organization_id: ORG, profile_id: "u1", role }] : [],
      profiles: [{ id: "u1", email: "o@example.com" }],
      organizations: [{ id: ORG, platform_brand: "crankleads", crankleads_tier: "close", subscription_status: "active" }],
      companies: [
        {
          id: "c1",
          organization_id: ORG,
          ...snowCompany.company,
          industry_pack: { id: "property-maintenance-snow", version: 1, appliedAt: "", recipes: [] },
          online_booking_settings: {},
          quote_public_base_url: null,
        },
      ],
      service_catalog_items: snowCompany.catalog.map((item, i) => ({ id: `item-${i}`, organization_id: ORG, company_id: "c1", active: true, ...item })),
      public_form_keys: [],
      company_sites: [],
    },
    { company_sites: [["slug"], ["company_id"]] },
  );
  user = { id: "u1" };
}

const ctx = { params: { organizationId: ORG, companyId: "c1" } };
const req = (method: string, body?: unknown) =>
  new Request(`http://test/api/organizations/${ORG}/companies/c1/site`, { method, body: body ? JSON.stringify(body) : undefined, headers: { "content-type": "application/json" } });

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  seed();
});

function writer(): Partial<SiteGeneratorDeps> {
  return {
    writeCopy: vi.fn(async () => ({
      copy: {
        headline: "Snow removal in Barrie",
        subhead: "Call or send a request.",
        about: "Northshore Snow & Property plows, salts and shovels driveways and small lots across south Barrie.",
        serviceBlurbs: [],
        faqs: [
          { question: "What areas do you serve?", answer: "Barrie, Innisfil and Oro-Medonte." },
          { question: "Can I book online?", answer: "Yes. Tap Book online." },
          { question: "How do I get a quote?", answer: "Use the form on this page." },
        ],
      },
      usage,
    })),
    deliver: vi.fn(async () => ({ status: "sent" as const, body: "" })),
    now: () => new Date("2026-11-21T18:00:00Z"),
  };
}

describe("generateSite keeps the note", () => {
  it("saves it, hands it to the writer on every rebuild, and clears it on null", async () => {
    const d = writer();
    await generateSite(db.client, "c1", { copyNote: "  Make it friendlier  ", deps: d });
    expect(parseSiteContent(db.tables.company_sites[0].content)!.copyNote).toBe("Make it friendlier");

    await generateSite(db.client, "c1", { deps: d });
    const calls = (d.writeCopy as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[1][0]).toMatchObject({ ownerNote: "Make it friendlier" });
    expect(parseSiteContent(db.tables.company_sites[0].content)!.copyNote).toBe("Make it friendlier");

    await generateSite(db.client, "c1", { copyNote: null, deps: d });
    expect(calls[2][0]).not.toHaveProperty("ownerNote");
    expect(parseSiteContent(db.tables.company_sites[0].content)!.copyNote).toBeNull();
  });

  it("a rebuild keeps the owner's lines, questions, steps and sections", async () => {
    await generateSite(db.client, "c1", { deps: writer() });
    await updateSiteEdits(db.client, "c1", {
      serviceBlurbs: { roof_snow: "Roofs cleared fast.", not_a_service: "ignored" },
      faqs: [{ question: "Q?", answer: "A." }],
      steps: [
        { title: "One", text: "1" },
        { title: "Two", text: "2" },
      ],
      sections: [{ id: "faqs", hidden: true }],
    });
    await generateSite(db.client, "c1", { deps: writer() });
    const c = parseSiteContent(db.tables.company_sites[0].content)!;
    expect(c.edits.serviceBlurbs).toEqual({ roof_snow: "Roofs cleared fast." });
    expect(c.edits.faqs).toEqual([{ question: "Q?", answer: "A." }]);
    expect(c.edits.steps).toHaveLength(2);
    expect(c.settings.sections[0]).toEqual({ id: "faqs", hidden: true });
    expect(c.settings.sections).toHaveLength(SITE_SECTION_IDS.length);
  });
});

describe("routes", () => {
  it("owners save each part, and null or an empty line goes back to ours", async () => {
    await POST(req("POST", { action: "generate" }), ctx);

    let res = await PATCH(req("PATCH", { serviceBlurbs: { roof_snow: "Roofs cleared fast." } }), ctx);
    let site = (await res.json()).data.site;
    expect(site.services.find((s: { key: string }) => s.key === "roof_snow")).toMatchObject({ blurb: "Roofs cleared fast.", edited: true });

    res = await PATCH(req("PATCH", { serviceBlurbs: { roof_snow: "" } }), ctx);
    site = (await res.json()).data.site;
    expect(site.services.find((s: { key: string }) => s.key === "roof_snow").edited).toBe(false);

    res = await PATCH(req("PATCH", { faqs: [{ question: "Do you do cottages?", answer: "Yes." }] }), ctx);
    site = (await res.json()).data.site;
    expect(site).toMatchObject({ faqsEdited: true, faqs: [{ question: "Do you do cottages?", answer: "Yes." }] });
    res = await PATCH(req("PATCH", { faqs: null }), ctx);
    site = (await res.json()).data.site;
    expect(site.faqsEdited).toBe(false);
    expect(site.faqs).toEqual(site.generatedFaqs);

    res = await PATCH(req("PATCH", { sections: [{ id: "reviews", hidden: true }, { id: "services", hidden: false }] }), ctx);
    site = (await res.json()).data.site;
    expect(site.sections.slice(0, 2)).toMatchObject([
      { id: "reviews", hidden: true, label: "Google reviews" },
      { id: "services", hidden: false },
    ]);
    expect(site.sections).toHaveLength(SITE_SECTION_IDS.length);
  });

  it("the note rides on regenerate and shows in the view", async () => {
    await POST(req("POST", { action: "generate" }), ctx);
    const res = await POST(req("POST", { action: "regenerate", note: "We mostly work on cottages" }), ctx);
    expect((await res.json()).data.site.copyNote).toBe("We mostly work on cottages");
    const cleared = await POST(req("POST", { action: "regenerate", note: null }), ctx);
    expect((await cleared.json()).data.site.copyNote).toBeNull();
  });

  it("refuses bad input and non-managers", async () => {
    await POST(req("POST", { action: "generate" }), ctx);
    const nine = Array.from({ length: 9 }, (_, i) => ({ question: `Q${i}?`, answer: "A." }));
    expect((await PATCH(req("PATCH", { faqs: nine }), ctx)).status).toBe(400);
    expect((await PATCH(req("PATCH", { faqs: [{ question: "", answer: "A." }] }), ctx)).status).toBe(400);
    expect((await PATCH(req("PATCH", { steps: [{ title: "One", text: "1" }] }), ctx)).status).toBe(400);
    expect((await PATCH(req("PATCH", { sections: [{ id: "hero", hidden: true }] }), ctx)).status).toBe(400);
    expect((await POST(req("POST", { action: "regenerate", note: "x".repeat(401) }), ctx)).status).toBe(400);

    seed("member");
    expect((await PATCH(req("PATCH", { faqs: null }), ctx)).status).toBe(403);
  });
});
