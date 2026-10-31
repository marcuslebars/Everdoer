/** Settings → Your website: the company's generated page (docs/done-for-you.md → "Generated sites"). */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api-client";
import { supabase } from "@/lib/supabase";

export type SiteStatus = "draft" | "published" | "unpublished";
export type SiteMode = "full" | "price_page";

export interface SiteView {
  companyId: string;
  companyName: string;
  hasWebsite: boolean;
  canManage: boolean;
  /** The business's logo and photos (the first photo is the big one at the top of the page). */
  logoUrl: string | null;
  photos: string[];
  maxPhotos: number;
  /** Whether connecting a custom domain is set up on the server. */
  domainsEnabled: boolean;
  site: null | {
    slug: string;
    status: SiteStatus;
    mode: SiteMode;
    url: string;
    previewUrl: string;
    generatedAt: string | null;
    publishedAt: string | null;
    copySource: "ai" | "template" | "mixed" | null;
    headline: string;
    subhead: string;
    about: string;
    generated: { headline: string; subhead: string; about: string } | null;
    edited: { headline: boolean; subhead: boolean; about: boolean };
    showPrices: boolean;
    servicesCount: number;
    pricedCount: number;
    factsUsed: string[];
    /** Our address for the page (the custom domain, once live, is `url`). */
    ourUrl: string;
    faviconUrl: string | null;
    domain: null | {
      name: string;
      status: "pending" | "active" | "none";
      dns: { records: Array<{ type: "CNAME" | "TXT"; name: string; value: string; status: string | null }>; certificate: string | null; problem?: string | null };
      checkedAt: string | null;
    };
  };
}

export type SiteImageKind = "logo" | "photo" | "favicon";

export interface SiteEditInput {
  headline?: string | null;
  subhead?: string | null;
  about?: string | null;
  showPrices?: boolean;
  mode?: SiteMode;
}

export type SiteAction = "generate" | "regenerate" | "publish" | "unpublish";

const path = (orgId: string, companyId: string) => `/api/organizations/${orgId}/companies/${companyId}/site`;
const KEY = "company-site";

export const fetchSite = (orgId: string, companyId: string) => apiFetch<SiteView>(path(orgId, companyId));
export const saveSiteEdits = (orgId: string, companyId: string, body: SiteEditInput) =>
  apiFetch<SiteView>(path(orgId, companyId), { method: "PATCH", body: JSON.stringify(body) });
export const runSiteAction = (orgId: string, companyId: string, action: SiteAction, publish?: boolean) =>
  apiFetch<SiteView>(path(orgId, companyId), { method: "POST", body: JSON.stringify({ action, ...(publish !== undefined ? { publish } : {}) }) });

export function useSite(orgId: string, companyId: string | null) {
  return useQuery({ queryKey: [KEY, orgId, companyId], queryFn: () => fetchSite(orgId, companyId!), enabled: Boolean(orgId && companyId) });
}

export function useSaveSiteEdits(orgId: string, companyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SiteEditInput) => saveSiteEdits(orgId, companyId, body),
    onSuccess: (data) => qc.setQueryData([KEY, orgId, companyId], data),
  });
}

export function useSiteAction(orgId: string, companyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { action: SiteAction; publish?: boolean }) => runSiteAction(orgId, companyId, input.action, input.publish),
    onSuccess: (data) => qc.setQueryData([KEY, orgId, companyId], data),
  });
}

// ── Images (logo, photos, tab icon) ─────────────────────────────────────────

const LIMITS: Record<SiteImageKind, { edge: number; square: boolean; type: "image/png" | "image/jpeg" }> = {
  logo: { edge: 800, square: false, type: "image/png" },
  favicon: { edge: 256, square: true, type: "image/png" },
  photo: { edge: 1600, square: false, type: "image/jpeg" },
};

/**
 * Re-encode in the browser before upload: a size cap, PNG (keeps a logo's transparent background)
 * or JPEG for photos, and no camera EXIF/GPS. The tab icon is centred on a square.
 */
export async function prepareSiteImage(file: Blob, kind: SiteImageKind): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file (PNG or JPG).");
  if (file.size > 15 * 1024 * 1024) throw new Error("That image is too big. Choose one under 15 MB.");
  const limit = LIMITS[kind];
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("Couldn't read that image. Try a PNG or JPG.");
  });
  const scale = Math.min(1, limit.edge / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = limit.square ? limit.edge : w;
  canvas.height = limit.square ? limit.edge : h;
  const g = canvas.getContext("2d");
  if (!g) throw new Error("This browser can't process images.");
  if (limit.square) {
    const fit = Math.min(limit.edge / bitmap.width, limit.edge / bitmap.height);
    const dw = bitmap.width * fit;
    const dh = bitmap.height * fit;
    g.drawImage(bitmap, (limit.edge - dw) / 2, (limit.edge - dh) / 2, dw, dh);
  } else {
    if (limit.type === "image/jpeg") {
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, w, h);
    }
    g.drawImage(bitmap, 0, 0, w, h);
  }
  bitmap.close?.();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, limit.type, 0.85));
  if (!blob) throw new Error("Couldn't process that image.");
  return blob;
}

const imagesPath = (orgId: string, companyId: string) => `${path(orgId, companyId)}/images`;

export async function uploadSiteImage(orgId: string, companyId: string, kind: SiteImageKind, file: File): Promise<SiteView> {
  if (!supabase) throw new Error("Uploads aren't available right now.");
  const blob = await prepareSiteImage(file, kind);
  const upload = await apiFetch<{ path: string; token: string; contentType: string }>(imagesPath(orgId, companyId), {
    method: "POST",
    body: JSON.stringify({ kind }),
  });
  const { error } = await supabase.storage.from("site-images").uploadToSignedUrl(upload.path, upload.token, blob, { contentType: upload.contentType });
  if (error) throw new Error(error.message || "Upload failed.");
  return apiFetch<SiteView>(imagesPath(orgId, companyId), { method: "PATCH", body: JSON.stringify({ action: "save", kind, path: upload.path }) });
}

export function useSiteImages(orgId: string, companyId: string) {
  const qc = useQueryClient();
  const set = (data: SiteView) => qc.setQueryData([KEY, orgId, companyId], data);
  const upload = useMutation({
    mutationFn: (input: { kind: SiteImageKind; file: File }) => uploadSiteImage(orgId, companyId, input.kind, input.file),
    onSuccess: set,
  });
  const change = useMutation({
    mutationFn: (input: { action: "remove" | "cover"; kind: SiteImageKind; url?: string }) =>
      apiFetch<SiteView>(imagesPath(orgId, companyId), { method: "PATCH", body: JSON.stringify(input) }),
    onSuccess: set,
  });
  return { upload, change };
}

// ── Your own domain ──────────────────────────────────────────────────────────

const domainPath = (orgId: string, companyId: string) => `${path(orgId, companyId)}/domain`;

export function useSiteDomain(orgId: string, companyId: string) {
  const qc = useQueryClient();
  const set = (data: SiteView) => qc.setQueryData([KEY, orgId, companyId], data);
  const connect = useMutation({
    mutationFn: (domain: string) => apiFetch<SiteView>(domainPath(orgId, companyId), { method: "POST", body: JSON.stringify({ domain }) }),
    onSuccess: set,
  });
  const check = useMutation({
    mutationFn: () => apiFetch<SiteView>(domainPath(orgId, companyId), { method: "PATCH" }),
    onSuccess: set,
  });
  const remove = useMutation({
    mutationFn: () => apiFetch<SiteView>(domainPath(orgId, companyId), { method: "DELETE" }),
    onSuccess: set,
  });
  return { connect, check, remove };
}
