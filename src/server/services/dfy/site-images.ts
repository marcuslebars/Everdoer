// ─────────────────────────────────────────────────────────────────────────────
// SANCTIONED EXCEPTION (service role): Settings → Your website → logo, photos and tab icon. The
// route checks org membership (owner/admin) and that the company is the org's on the caller's
// RLS client first; only then does this mint upload URLs and write that one company's
// brand_logo_url / profile.photos / company_sites.favicon_url with the service role.
// docs/done-for-you.md → "Generated sites" → "Images and your own domain".
// ─────────────────────────────────────────────────────────────────────────────
import { randomUUID } from "node:crypto";

import type { Json, Tables } from "@/server/db/database.types";
import { UserFacingError } from "@/server/errors";
import type { AdminClient } from "@/server/services/done-for-you/purchases";

import { parseSiteContent, type SiteContent } from "./site-content";

export const SITE_IMAGES_BUCKET = "site-images";
export const MAX_SITE_PHOTOS = 6;

export const SITE_IMAGE_KINDS = ["logo", "photo", "favicon"] as const;
export type SiteImageKind = (typeof SITE_IMAGE_KINDS)[number];

/** What each kind is stored as (the browser re-encodes before upload). */
const KIND_FORMAT: Record<SiteImageKind, { ext: "png" | "jpg"; contentType: "image/png" | "image/jpeg" }> = {
  logo: { ext: "png", contentType: "image/png" },
  favicon: { ext: "png", contentType: "image/png" },
  photo: { ext: "jpg", contentType: "image/jpeg" },
};

type Scope = { organizationId: string; companyId: string };

export function siteImagePrefix(scope: Scope): string {
  return `${scope.organizationId}/${scope.companyId}/`;
}

/** Our own object path for this company and kind, else null. PURE. */
export function ownImagePath(scope: Scope, kind: SiteImageKind, path: string): string | null {
  const prefix = siteImagePrefix(scope);
  if (!path.startsWith(prefix)) return null;
  const name = path.slice(prefix.length);
  const re = new RegExp(`^${kind}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.${KIND_FORMAT[kind].ext}$`);
  return re.test(name) ? path : null;
}

/** The storage path inside our bucket for one of our public URLs, else null. PURE. */
export function pathFromPublicUrl(url: string): string | null {
  const marker = `/storage/v1/object/public/${SITE_IMAGES_BUCKET}/`;
  const i = url.indexOf(marker);
  return i === -1 ? null : decodeURIComponent(url.slice(i + marker.length).split("?")[0]);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {};
}

/** companies.profile.photos as https URLs (strings or { url }). PURE. */
export function profilePhotos(profile: unknown): string[] {
  const raw = asRecord(profile).photos;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p) => (typeof p === "string" ? p : p && typeof p === "object" ? (p as Record<string, unknown>).url : null))
    .filter((p): p is string => typeof p === "string" && p.startsWith("https://"))
    .slice(0, MAX_SITE_PHOTOS);
}

/** A signed upload URL for one new image (the client uploads straight to storage). */
export async function createSiteImageUpload(admin: AdminClient, scope: Scope, kind: SiteImageKind): Promise<{ path: string; token: string; contentType: string }> {
  if (kind === "photo") {
    const { data } = await admin.from("companies").select("profile").eq("organization_id", scope.organizationId).eq("id", scope.companyId).maybeSingle();
    if (profilePhotos((data as { profile: Json } | null)?.profile).length >= MAX_SITE_PHOTOS) {
      throw new UserFacingError(`You can have up to ${MAX_SITE_PHOTOS} photos. Remove one first.`);
    }
  }
  const { ext, contentType } = KIND_FORMAT[kind];
  const path = `${siteImagePrefix(scope)}${kind}-${randomUUID()}.${ext}`;
  const { data, error } = await admin.storage.from(SITE_IMAGES_BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw error ?? new Error("Could not create an upload URL.");
  return { path, token: data.token, contentType };
}

async function objectExists(admin: AdminClient, path: string): Promise<boolean> {
  const slash = path.lastIndexOf("/");
  const { data, error } = await admin.storage.from(SITE_IMAGES_BUCKET).list(path.slice(0, slash), { search: path.slice(slash + 1), limit: 1 });
  if (error) throw error;
  return (data ?? []).some((o) => o.name === path.slice(slash + 1));
}

async function removeObject(admin: AdminClient, scope: Scope, url: string | null | undefined): Promise<void> {
  const path = url ? pathFromPublicUrl(url) : null;
  if (!path || !path.startsWith(siteImagePrefix(scope))) return; // never someone else's, never an outside URL
  try {
    await admin.storage.from(SITE_IMAGES_BUCKET).remove([path]);
  } catch (err) {
    console.error("[site-images] couldn't delete an old image:", err instanceof Error ? err.message : err);
  }
}

type CompanyImages = Pick<Tables<"companies">, "brand_logo_url" | "profile">;

/**
 * Change companies.profile.photos without losing a concurrent change: the write is conditional on
 * companies.updated_at being what we read (the same pattern as ai_settings), retried a few times.
 * `mutate` gets the current photos and returns the new list, or throws to refuse.
 */
async function updatePhotos(admin: AdminClient, scope: Scope, mutate: (photos: string[]) => string[], attempts = 4): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const { data, error } = await admin.from("companies").select("profile, updated_at").eq("organization_id", scope.organizationId).eq("id", scope.companyId).maybeSingle();
    if (error) throw error;
    const row = data as Pick<Tables<"companies">, "profile" | "updated_at"> | null;
    if (!row) throw new UserFacingError("Company not found.", { status: 404 });
    // Entries are kept as their https URL ({ url, caption } objects lose the caption).
    const photos = mutate(profilePhotos(row.profile));
    const next = { ...asRecord(row.profile), photos };
    const bumped = new Date(Math.max(Date.now(), (Date.parse(row.updated_at) || 0) + 1)).toISOString();
    const { data: written, error: writeError } = await admin
      .from("companies")
      .update({ profile: next as Json, updated_at: bumped })
      .eq("organization_id", scope.organizationId)
      .eq("id", scope.companyId)
      .eq("updated_at", row.updated_at)
      .select("id");
    if (writeError) throw writeError;
    if (((written ?? []) as unknown[]).length > 0) return;
  }
  throw new UserFacingError("Couldn't save the photos (something else was saving). Try again.", { status: 409 });
}

async function loadCompanyImages(admin: AdminClient, scope: Scope): Promise<CompanyImages> {
  const { data, error } = await admin.from("companies").select("brand_logo_url, profile").eq("organization_id", scope.organizationId).eq("id", scope.companyId).maybeSingle();
  if (error) throw error;
  if (!data) throw new UserFacingError("Company not found.", { status: 404 });
  return data as CompanyImages;
}

/**
 * The site's content holds a snapshot of the business's facts, so a new logo or photo wouldn't
 * show until the page was regenerated. Copy the live logo and photos into it now.
 */
export async function syncSiteImages(admin: AdminClient, scope: Scope): Promise<void> {
  const [company, { data: siteData }] = await Promise.all([
    loadCompanyImages(admin, scope),
    admin.from("company_sites").select("id, content").eq("organization_id", scope.organizationId).eq("company_id", scope.companyId).maybeSingle(),
  ]);
  const site = siteData as Pick<Tables<"company_sites">, "id" | "content"> | null;
  const content = site ? parseSiteContent(site.content) : null;
  if (!site || !content) return;
  const logoUrl = company.brand_logo_url?.startsWith("https://") ? company.brand_logo_url : null;
  const photos = profilePhotos(company.profile);
  const used = content.factsUsed.filter((f) => f !== "logo" && f !== "photos");
  if (logoUrl) used.push("logo");
  if (photos.length) used.push("photos");
  const next: SiteContent = { ...content, facts: { ...content.facts, logoUrl, photos }, factsUsed: used };
  const { error } = await admin.from("company_sites").update({ content: next as unknown as Json }).eq("id", site.id);
  if (error) throw error;
}

/** Record an uploaded image: the logo, a photo (added at the end), or the tab icon. */
export async function saveSiteImage(admin: AdminClient, scope: Scope, kind: SiteImageKind, path: string): Promise<void> {
  if (!ownImagePath(scope, kind, path)) throw new UserFacingError("That upload doesn't belong to this business.");
  if (!(await objectExists(admin, path))) throw new UserFacingError("The upload didn't finish. Try again.");
  const url = admin.storage.from(SITE_IMAGES_BUCKET).getPublicUrl(path).data.publicUrl;

  if (kind === "favicon") {
    const { data: site } = await admin.from("company_sites").select("id, favicon_url").eq("organization_id", scope.organizationId).eq("company_id", scope.companyId).maybeSingle();
    const row = site as Pick<Tables<"company_sites">, "id" | "favicon_url"> | null;
    if (!row) throw new UserFacingError("Create your page first, then add its tab icon.");
    const { error } = await admin.from("company_sites").update({ favicon_url: url }).eq("id", row.id);
    if (error) throw error;
    await removeObject(admin, scope, row.favicon_url);
    return;
  }

  const company = await loadCompanyImages(admin, scope);
  if (kind === "logo") {
    const { error } = await admin.from("companies").update({ brand_logo_url: url }).eq("organization_id", scope.organizationId).eq("id", scope.companyId);
    if (error) throw error;
    await removeObject(admin, scope, company.brand_logo_url);
  } else {
    try {
      await updatePhotos(admin, scope, (photos) => {
        if (photos.includes(url)) return photos;
        if (photos.length >= MAX_SITE_PHOTOS) throw new UserFacingError(`You can have up to ${MAX_SITE_PHOTOS} photos. Remove one first.`);
        return [...photos, url];
      });
    } catch (err) {
      await removeObject(admin, scope, url); // not kept: don't leave the file behind
      throw err;
    }
  }
  await syncSiteImages(admin, scope);
}

/** Remove the logo, the tab icon, or one photo (by URL). */
export async function removeSiteImage(admin: AdminClient, scope: Scope, kind: SiteImageKind, url?: string): Promise<void> {
  if (kind === "favicon") {
    const { data: site } = await admin.from("company_sites").select("id, favicon_url").eq("organization_id", scope.organizationId).eq("company_id", scope.companyId).maybeSingle();
    const row = site as Pick<Tables<"company_sites">, "id" | "favicon_url"> | null;
    if (!row) return;
    const { error } = await admin.from("company_sites").update({ favicon_url: null }).eq("id", row.id);
    if (error) throw error;
    await removeObject(admin, scope, row.favicon_url);
    return;
  }
  const company = await loadCompanyImages(admin, scope);
  if (kind === "logo") {
    const { error } = await admin.from("companies").update({ brand_logo_url: null }).eq("organization_id", scope.organizationId).eq("id", scope.companyId);
    if (error) throw error;
    await removeObject(admin, scope, company.brand_logo_url);
  } else {
    await updatePhotos(admin, scope, (photos) => {
      if (!url || !photos.includes(url)) throw new UserFacingError("That photo isn't on your page.");
      return photos.filter((p) => p !== url);
    });
    await removeObject(admin, scope, url);
  }
  await syncSiteImages(admin, scope);
}

/** Make one photo the first (the big photo at the top of the page). */
export async function makeCoverPhoto(admin: AdminClient, scope: Scope, url: string): Promise<void> {
  await updatePhotos(admin, scope, (photos) => {
    if (!photos.includes(url)) throw new UserFacingError("That photo isn't on your page.");
    return [url, ...photos.filter((p) => p !== url)];
  });
  await syncSiteImages(admin, scope);
}
