/**
 * What Settings → Your website shows (owner routes under .../companies/:companyId/site). Read on
 * the caller's RLS client (members can read company_sites and companies).
 */
import type { Tables } from "@/server/db/database.types";
import { loadOrganizationBrand } from "@/server/services/platform-brand";
import type { TenantServiceContext } from "@/server/services/shared";

import { effectiveCopy, parseSiteContent } from "./site-content";
import { cloudflareConfig, type DomainDns, type DomainStatus } from "./site-domain";
import { MAX_SITE_PHOTOS, profilePhotos } from "./site-images";
import { sitePublicUrl } from "./site-public";
import { siteUrl } from "./site-url";

/** What Settings → Your website shows. */
export async function siteView(ctx: TenantServiceContext, companyId: string, canManage: boolean) {
  const [{ data: siteData, error }, { data: companyData }] = await Promise.all([
    ctx.supabase.from("company_sites").select("*").eq("organization_id", ctx.organizationId).eq("company_id", companyId).maybeSingle(),
    ctx.supabase.from("companies").select("id, name, website, brand_logo_url, profile").eq("organization_id", ctx.organizationId).eq("id", companyId).maybeSingle(),
  ]);
  if (error) throw error;
  const site = siteData as Tables<"company_sites"> | null;
  const company = companyData as Pick<Tables<"companies">, "id" | "name" | "website" | "brand_logo_url" | "profile"> | null;
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

