/**
 * What Settings → Your website shows (owner routes under .../companies/:companyId/site). Read on
 * the caller's RLS client (members can read company_sites and companies).
 */
import { autoThemeForTrade, parseSiteStyle } from "@/lib/site-style";
import type { Tables } from "@/server/db/database.types";
import { parseAppliedIndustryPack } from "@/server/services/packs/types";
import { loadOrganizationBrand } from "@/server/services/platform-brand";
import type { TenantServiceContext } from "@/server/services/shared";

import { defaultSiteSteps, effectiveCopy, effectiveSteps, parseSiteContent, SITE_SECTION_LABELS, type SiteContent } from "./site-content";
import { cloudflareConfig, type DomainDns, type DomainStatus } from "./site-domain";
import { parseServiceTowns, sitePages, sitePageUrl } from "./site-pages";
import { unsplashAccessKey } from "./site-stock";
import { MAX_SITE_PHOTOS, profilePhotos } from "./site-images";
import { sitePublicUrl } from "./site-public";
import { siteUrl } from "./site-url";

/** What Settings → Your website shows. */
export async function siteView(ctx: TenantServiceContext, companyId: string, canManage: boolean) {
  const [{ data: siteData, error }, { data: companyData }] = await Promise.all([
    ctx.supabase.from("company_sites").select("*").eq("organization_id", ctx.organizationId).eq("company_id", companyId).maybeSingle(),
    ctx.supabase.from("companies").select("id, name, website, brand_logo_url, profile, site_style, industry_pack").eq("organization_id", ctx.organizationId).eq("id", companyId).maybeSingle(),
  ]);
  if (error) throw error;
  const site = siteData as Tables<"company_sites"> | null;
  const company = companyData as Pick<Tables<"companies">, "id" | "name" | "website" | "brand_logo_url" | "profile" | "site_style" | "industry_pack"> | null;
  const tradeId = parseAppliedIndustryPack(company?.industry_pack)?.id ?? null;
  const base = {
    companyId,
    companyName: company?.name ?? "",
    hasWebsite: Boolean(company?.website?.trim()),
    canManage,
    // Logo and photos belong to the business (quotes and invoices use the logo too).
    logoUrl: company?.brand_logo_url?.startsWith("https://") ? company.brand_logo_url : null,
    photos: profilePhotos(company?.profile),
    maxPhotos: MAX_SITE_PHOTOS,
    domainsEnabled: cloudflareConfig() !== null,
    // The look picked before the page exists ("auto" → autoTheme, by trade).
    style: parseSiteStyle(company?.site_style),
    autoTheme: autoThemeForTrade(tradeId),
  };
  if (!site) return { ...base, site: null };
  const brand = await loadOrganizationBrand(ctx.supabase, ctx.organizationId);
  const content = parseSiteContent(site.content);
  const copy = content ? effectiveCopy(content) : null;
  return {
    ...base,
    site: {
      slug: site.slug,
      status: site.status,
      mode: site.mode,
      url: sitePublicUrl(site, brand.key),
      ourUrl: siteUrl(site.slug, brand.key),
      previewUrl: `/api/organizations/${ctx.organizationId}/companies/${companyId}/site/preview`,
      generatedAt: site.generated_at,
      publishedAt: site.published_at,
      copySource: content?.copySource ?? null,
      headline: copy?.headline ?? "",
      subhead: copy?.subhead ?? "",
      about: copy?.about ?? "",
      generated: content ? { headline: content.copy.headline, subhead: content.copy.subhead, about: content.copy.about } : null,
      edited: {
        headline: Boolean(content?.edits.headline),
        subhead: Boolean(content?.edits.subhead),
        about: Boolean(content?.edits.about),
      },
      showPrices: content?.settings.showPrices ?? true,
      ...(content ? contentEditing(content) : EMPTY_EDITING),
      stock: content
        ? {
            /** Stock photos are set up on the server (UNSPLASH_ACCESS_KEY). */
            available: Boolean(unsplashAccessKey()),
            enabled: content.settings.stockPhoto,
            photo: content.stockPhoto
              ? { url: content.stockPhoto.url, alt: content.stockPhoto.alt, photographer: content.stockPhoto.photographer, photographerUrl: content.stockPhoto.photographerUrl, pageUrl: content.stockPhoto.pageUrl }
              : null,
          }
        : null,
      pages: content ? pagesView(content, sitePublicUrl(site, brand.key), `/api/organizations/${ctx.organizationId}/companies/${companyId}/site/preview`) : null,
      theme: content?.settings.theme ?? "auto",
      color: content?.settings.color ?? null,
      servicesCount: content?.facts.services.length ?? 0,
      pricedCount: content?.facts.services.filter((s) => s.priceText).length ?? 0,
      factsUsed: content?.factsUsed ?? [],
      faviconUrl: site.favicon_url,
      domain: site.custom_domain
        ? {
            name: site.custom_domain,
            status: site.custom_domain_status as DomainStatus,
            dns: (site.custom_domain_dns as unknown as DomainDns | null) ?? { records: [], certificate: null },
            checkedAt: site.custom_domain_checked_at,
          }
        : null,
    },
  };
}


const EMPTY_EDITING = {
  copyNote: null as string | null,
  sections: [] as Array<{ id: string; label: string; hidden: boolean; available: boolean }>,
  services: [] as Array<{ key: string; label: string; blurb: string; generated: string; edited: boolean }>,
  faqs: [] as Array<{ question: string; answer: string }>,
  generatedFaqs: [] as Array<{ question: string; answer: string }>,
  faqsEdited: false,
  steps: [] as Array<{ title: string; text: string }>,
  generatedSteps: [] as Array<{ title: string; text: string }>,
  stepsEdited: false,
};

/** The owner-editable parts: sections, service lines, questions, steps and the writer note. */
function contentEditing(content: SiteContent): typeof EMPTY_EDITING {
  const f = content.facts;
  const copy = effectiveCopy(content);
  // The page always has the quote form; the steps follow what else it offers.
  const offers = { phone: Boolean(f.phoneE164), form: true, booking: f.bookingEnabled };
  const anyPrice = content.settings.showPrices && f.services.some((s) => s.priceText);
  // Whether a section has anything to show, so the editor can say "nothing to show yet".
  const available: Record<string, boolean> = {
    services: f.services.length > 0,
    steps: content.mode !== "price_page",
    photos: f.photos.length > 1,
    about: content.mode !== "price_page" || Boolean(f.serviceArea || f.hoursLines.length),
    reviews: Boolean(f.rating && f.reviewCount),
    faqs: copy.faqs.length > 0,
  };
  return {
    copyNote: content.copyNote,
    sections: content.settings.sections.map((sec) => ({ id: sec.id, label: SITE_SECTION_LABELS[sec.id], hidden: sec.hidden, available: available[sec.id] ?? true })),
    services: f.services.map((s) => ({
      key: s.key,
      label: s.label,
      blurb: copy.serviceBlurbs[s.key] ?? "",
      generated: content.copy.serviceBlurbs[s.key] ?? "",
      edited: Boolean(content.edits.serviceBlurbs?.[s.key]),
    })),
    faqs: copy.faqs,
    generatedFaqs: content.copy.faqs,
    faqsEdited: Array.isArray(content.edits.faqs),
    steps: effectiveSteps(content, offers),
    generatedSteps: defaultSiteSteps({ ...offers, anyPrice }),
    stepsEdited: Array.isArray(content.edits.steps),
  };
}

/** Service and town pages: the settings, the towns read from the service area, and every page. */
function pagesView(content: SiteContent, homeUrl: string, previewBase: string) {
  return {
    enabled: content.mode === "full",
    services: content.settings.pages.services,
    areas: content.settings.pages.areas,
    towns: content.settings.pages.towns,
    areaTowns: parseServiceTowns(content.facts.serviceArea),
    list: sitePages(content).map((p) => ({
      kind: p.kind,
      label: p.label,
      url: sitePageUrl(homeUrl, p.path),
      previewUrl: `${previewBase}?page=${encodeURIComponent(p.path)}`,
    })),
  };
}
