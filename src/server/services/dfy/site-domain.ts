// ─────────────────────────────────────────────────────────────────────────────
// SANCTIONED EXCEPTION (service role): Settings → Your website → your own domain. The route
// checks org membership (owner/admin) and that the company is the org's on the caller's RLS
// client first; only then does this write that one company's company_sites domain columns.
// docs/custom-domains.md.
//
// Cloudflare for SaaS on the everdoer.com zone: each business domain is a "custom hostname"
// (Cloudflare issues its certificate once the owner's CNAME points at SITES_CNAME_TARGET). The
// sites-edge Worker (cloudflare/sites-edge) then forwards "/" to our app's /s/_domain with the
// domain in a signed header. Railway only ever sees our own hostnames, so there's no per-service
// domain cap. Env [web]:
//   CLOUDFLARE_API_TOKEN   token with Zone → SSL and Certificates: Edit on everdoer.com
//   CLOUDFLARE_ZONE_ID     the everdoer.com zone id
//   SITES_CNAME_TARGET     what owners point their domain at (default sites.everdoer.com)
// Without the token / zone, connecting a domain is refused with a plain message.
// ─────────────────────────────────────────────────────────────────────────────
import type { Json, Tables } from "@/server/db/database.types";
import { UserFacingError } from "@/server/errors";
import type { AdminClient } from "@/server/services/done-for-you/purchases";

const CLOUDFLARE_API = "https://api.cloudflare.com/client/v4";

type Scope = { organizationId: string; companyId: string };

export type DomainStatus = "none" | "pending" | "active";

/** A DNS record the owner adds at their domain provider. */
export interface DnsRecord {
  type: "CNAME" | "TXT";
  /** The "Name"/"Host" field, relative to the domain they bought ("@" = the domain itself). */
  name: string;
  value: string;
  /** "VALID" once Cloudflare sees it working, null while waiting. */
  status: string | null;
}

export interface DomainDns {
  records: DnsRecord[];
  /** Certificate state (Cloudflare's ssl.status), for support. */
  certificate: string | null;
  /** Cloudflare's own explanation when something's wrong (e.g. the CNAME points elsewhere). */
  problem?: string | null;
}

/** Domains that can never be a business's site (ours, Railway's, test names). */
const RESERVED_SUFFIXES = ["everdoer.com", "empirevu.com", "crankleads.com", "railway.app", "railway.internal", "localhost", "test", "example.com", "example.org", "example.net", "invalid", "local"];

/**
 * "https://www.Acme.ca/" → "www.acme.ca". Throws a plain message when it isn't a usable domain.
 * PURE.
 */
export function normalizeDomain(input: string): string {
  let d = (input ?? "").trim().toLowerCase();
  d = d.replace(/^[a-z]+:\/\//, "").split(/[/?#]/)[0].replace(/:\d+$/, "").replace(/\.$/, "");
  if (!d) throw new UserFacingError("Type the domain, like www.yourbusiness.com.");
  if (d.length > 253 || !/^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+([a-z]{2,63}|xn--[a-z0-9-]{2,59})$/.test(d)) {
    throw new UserFacingError("That doesn't look like a domain. Type it like www.yourbusiness.com.");
  }
  if (RESERVED_SUFFIXES.some((s) => d === s || d.endsWith(`.${s}`))) {
    throw new UserFacingError("That domain can't be used. Use a domain your business owns.");
  }
  return d;
}

/**
 * What to type in the DNS "Name" field: the part before the domain they bought. We can't know
 * where their registered domain starts (acme.ca vs acme.co.uk), so: a two-label domain is the
 * root ("@"); otherwise the first label (www.acme.ca → "www"; shop.acme.co.uk → "shop"). PURE.
 */
export function recordName(domain: string): string {
  const labels = domain.split(".");
  if (labels.length <= 2) return "@";
  const twoPartSuffix = /^(co|com|org|net|gov|ac|edu)\.[a-z]{2}$/.test(labels.slice(-2).join("."));
  if (twoPartSuffix && labels.length === 3) return "@";
  return labels.slice(0, labels.length - (twoPartSuffix ? 3 : 2)).join(".");
}

/** Cloudflare's custom hostname (the fields we read). */
export interface CloudflareHostname {
  id: string;
  hostname: string;
  status?: string | null;
  ssl?: { status?: string | null; validation_errors?: Array<{ message?: string | null }> | null } | null;
  verification_errors?: string[] | null;
}

/** Cloudflare's state → the record to show and whether the domain is live. PURE. */
export function readHostname(domain: string, target: string, h: CloudflareHostname | null | undefined): { dns: DomainDns; active: boolean } {
  const active = h?.status === "active" && h?.ssl?.status === "active";
  const problem =
    [...(h?.verification_errors ?? []), ...((h?.ssl?.validation_errors ?? []).map((e) => e?.message ?? "").filter(Boolean) as string[])]
      .map((m) => m.trim())
      .filter(Boolean)
      .join(" ")
      .slice(0, 300) || null;
  return {
    dns: {
      records: [{ type: "CNAME", name: recordName(domain), value: target, status: active ? "VALID" : null }],
      certificate: h?.ssl?.status ?? null,
      problem: active ? null : problem,
    },
    active,
  };
}

export interface CloudflareConfig {
  token: string;
  zoneId: string;
  target: string;
}

export function cloudflareConfig(env: NodeJS.ProcessEnv = process.env): CloudflareConfig | null {
  const token = env.CLOUDFLARE_API_TOKEN?.trim();
  const zoneId = env.CLOUDFLARE_ZONE_ID?.trim();
  if (!token || !zoneId) return null;
  return { token, zoneId, target: (env.SITES_CNAME_TARGET?.trim() || "sites.everdoer.com").toLowerCase() };
}

export type ApiFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** Cloudflare took too long or is down: the owner gets "try again". */
export class DomainProviderUnavailableError extends UserFacingError {
  constructor() {
    super("We couldn't reach our hosting provider just now. Try again in a minute.", { status: 503 });
  }
}

class CloudflareApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly codes: number[],
  ) {
    super(message);
  }
}

async function cf<T>(cfg: CloudflareConfig, method: string, path: string, body: unknown, fetchImpl: ApiFetch): Promise<T> {
  const signal = typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(8000) : undefined;
  let res: Awaited<ReturnType<ApiFetch>>;
  try {
    res = await fetchImpl(`${CLOUDFLARE_API}${path}`, {
      method,
      headers: { "content-type": "application/json", authorization: `Bearer ${cfg.token}` },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal,
    });
  } catch {
    throw new DomainProviderUnavailableError();
  }
  if (res.status >= 500) throw new DomainProviderUnavailableError();
  const json = (await res.json().catch(() => ({}))) as { success?: boolean; result?: T; errors?: Array<{ code?: number; message?: string }> };
  if (!res.ok || json.success === false) {
    const errors = json.errors ?? [];
    throw new CloudflareApiError(`Cloudflare: ${errors.map((e) => e.message).filter(Boolean).join("; ") || `HTTP ${res.status}`}`, res.status, errors.map((e) => e.code ?? 0));
  }
  return json.result as T;
}

/** How many sites may have a domain connected at once (Cloudflare bills past 100; hard max 50,000). */
export function siteDomainCap(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.SITE_DOMAINS_MAX);
  return Number.isInteger(n) && n >= 0 ? n : 1000;
}

/** A domain still waiting on DNS after this long is released (frees the name and the hostname). */
export const PENDING_DOMAIN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface DomainDeps {
  config: CloudflareConfig | null;
  fetch: ApiFetch;
  now: () => Date;
}

function defaultDeps(): DomainDeps {
  return { config: cloudflareConfig(), fetch: (url, init) => fetch(url, init), now: () => new Date() };
}

type SiteDomainRow = Pick<
  Tables<"company_sites">,
  "id" | "custom_domain" | "custom_domain_ref" | "custom_domain_status" | "custom_domain_dns" | "custom_domain_checked_at" | "custom_domain_added_at"
>;

async function loadSite(admin: AdminClient, scope: Scope): Promise<SiteDomainRow | null> {
  const { data, error } = await admin
    .from("company_sites")
    .select("id, custom_domain, custom_domain_ref, custom_domain_status, custom_domain_dns, custom_domain_checked_at, custom_domain_added_at")
    .eq("organization_id", scope.organizationId)
    .eq("company_id", scope.companyId)
    .maybeSingle();
  if (error) throw error;
  return data as SiteDomainRow | null;
}

/** If the site's quote form only accepts listed websites, the domain must be on that list. */
async function allowOnSiteForm(admin: AdminClient, scope: Scope, domain: string): Promise<void> {
  const { data } = await admin.from("public_form_keys").select("id, allowed_origins").eq("organization_id", scope.organizationId).eq("company_id", scope.companyId).eq("active", true);
  const origin = `https://${domain}`;
  for (const key of (data ?? []) as Array<{ id: string; allowed_origins: string[] | null }>) {
    const list = key.allowed_origins ?? [];
    if (list.length === 0 || list.includes(origin)) continue; // open to any site already
    await admin.from("public_form_keys").update({ allowed_origins: [...list, origin] }).eq("id", key.id);
  }
}

async function findHostname(cfg: CloudflareConfig, domain: string, fetchImpl: ApiFetch): Promise<CloudflareHostname | null> {
  const list = await cf<CloudflareHostname[]>(cfg, "GET", `/zones/${cfg.zoneId}/custom_hostnames?hostname=${encodeURIComponent(domain)}`, undefined, fetchImpl);
  return (list ?? []).find((h) => h.hostname?.toLowerCase() === domain) ?? null;
}

/** Add the business's domain: Cloudflare starts serving it once their CNAME points at us. */
export async function connectSiteDomain(admin: AdminClient, scope: Scope, input: string, deps: DomainDeps = defaultDeps()): Promise<void> {
  const domain = normalizeDomain(input);
  const site = await loadSite(admin, scope);
  if (!site) throw new UserFacingError("Create your page first, then connect your domain.");
  if (site.custom_domain) throw new UserFacingError("Remove the current domain first.");
  if (!deps.config) throw new UserFacingError("Connecting your own domain isn't switched on yet. Contact support and we'll set it up.");
  const cfg = deps.config;
  const { data: taken } = await admin.from("company_sites").select("id").eq("custom_domain", domain).maybeSingle();
  if (taken) throw new UserFacingError("That domain is already connected to another business.");
  const { data: inUse } = await admin.from("company_sites").select("id").not("custom_domain", "is", null);
  if (((inUse ?? []) as unknown[]).length >= siteDomainCap()) {
    throw new UserFacingError("We can't connect more domains right now. Contact support and we'll add yours.");
  }

  // Already a hostname on our zone (an earlier attempt whose reply was lost, or a disconnect that
  // didn't finish): take it over. Nothing in our DB claims it (checked above).
  let hostname = await findHostname(cfg, domain, deps.fetch);
  const adopted = Boolean(hostname);
  if (!hostname) {
    try {
      hostname = await cf<CloudflareHostname>(
        cfg,
        "POST",
        `/zones/${cfg.zoneId}/custom_hostnames`,
        { hostname: domain, ssl: { method: "http", type: "dv", settings: { min_tls_version: "1.2" } } },
        deps.fetch,
      );
    } catch (err) {
      if (err instanceof CloudflareApiError && err.status < 500) {
        throw new UserFacingError(`That domain can't be added: ${err.message.replace(/^Cloudflare:\s*/, "")}`);
      }
      throw err;
    }
  }
  const { dns } = readHostname(domain, cfg.target, hostname);
  const now = deps.now().toISOString();
  const { error } = await admin
    .from("company_sites")
    .update({
      custom_domain: domain,
      custom_domain_ref: hostname.id,
      custom_domain_status: "pending",
      custom_domain_dns: dns as unknown as Json,
      custom_domain_checked_at: adopted ? null : now, // an adopted domain is checked straight away
      custom_domain_added_at: now,
    })
    .eq("id", site.id)
    .is("custom_domain", null);
  if (error) {
    // Don't leave a hostname on the zone that nothing points to (one we just created).
    if (!adopted) await cf(cfg, "DELETE", `/zones/${cfg.zoneId}/custom_hostnames/${hostname.id}`, undefined, deps.fetch).catch(() => undefined);
    if ((error as { code?: string }).code === "23505") throw new UserFacingError("That domain is already connected to another business.");
    throw error;
  }
  await allowOnSiteForm(admin, scope, domain).catch((err) => console.error("[site-domain] couldn't allow the domain on the form:", err instanceof Error ? err.message : err));
  if (adopted) await checkSiteDomain(admin, scope, deps).catch(() => undefined);
}

function isNotFound(err: unknown): boolean {
  return err instanceof CloudflareApiError && (err.status === 404 || err.codes.includes(1436));
}

/**
 * Ask Cloudflare whether the domain is live yet. A domain still waiting after a week is released;
 * a live one that disappeared from Cloudflare goes back to waiting.
 */
export async function checkSiteDomain(admin: AdminClient, scope: Scope, deps: DomainDeps = defaultDeps()): Promise<DomainStatus> {
  const site = await loadSite(admin, scope);
  if (!site?.custom_domain || !site.custom_domain_ref) return "none";
  if (!deps.config) return site.custom_domain_status as DomainStatus;
  const cfg = deps.config;
  const ref = site.custom_domain_ref;

  if (site.custom_domain_status === "pending" && site.custom_domain_added_at && deps.now().getTime() - Date.parse(site.custom_domain_added_at) > PENDING_DOMAIN_TTL_MS) {
    await removeSiteDomain(admin, scope, deps);
    return "none";
  }

  let found: CloudflareHostname | null;
  try {
    found = await cf<CloudflareHostname>(cfg, "GET", `/zones/${cfg.zoneId}/custom_hostnames/${ref}`, undefined, deps.fetch);
  } catch (err) {
    if (!isNotFound(err)) throw err;
    found = null;
  }
  const { dns, active } = found
    ? readHostname(site.custom_domain, cfg.target, found)
    : { dns: { records: [], certificate: null, problem: null } as DomainDns, active: false };
  const status: DomainStatus = active ? "active" : "pending";
  // Only if it's still the same domain: a check racing a disconnect + reconnect must not mark
  // the new domain live with the old one's state.
  const { error } = await admin
    .from("company_sites")
    .update({ custom_domain_status: status, custom_domain_dns: dns as unknown as Json, custom_domain_checked_at: deps.now().toISOString() })
    .eq("id", site.id)
    .eq("custom_domain_ref", ref);
  if (error) throw error;
  return status;
}

/** Disconnect the domain (removed from Cloudflare too). */
export async function removeSiteDomain(admin: AdminClient, scope: Scope, deps: DomainDeps = defaultDeps()): Promise<void> {
  const site = await loadSite(admin, scope);
  if (!site?.custom_domain) return;
  if (site.custom_domain_ref) {
    // Clearing our side while the hostname stays on the zone would block reconnecting it, so a
    // failed delete is reported and the domain kept. Already gone is fine.
    if (!deps.config) throw new UserFacingError("Disconnecting isn't available right now. Contact support and we'll remove it.");
    try {
      await cf(deps.config, "DELETE", `/zones/${deps.config.zoneId}/custom_hostnames/${site.custom_domain_ref}`, undefined, deps.fetch);
    } catch (err) {
      if (!isNotFound(err)) {
        console.error("[site-domain] Cloudflare delete failed:", err instanceof Error ? err.message : err);
        throw err instanceof UserFacingError ? err : new UserFacingError("We couldn't disconnect the domain just now. Try again in a minute.", { status: 502 });
      }
    }
  }
  const { error } = await admin
    .from("company_sites")
    .update({ custom_domain: null, custom_domain_ref: null, custom_domain_status: "none", custom_domain_dns: null, custom_domain_checked_at: null, custom_domain_added_at: null })
    .eq("id", site.id);
  if (error) throw error;
}

/**
 * Re-check when Settings is opened: a pending domain at most once a minute, a live one every six
 * hours (in case it was removed from Cloudflare). PURE.
 */
export function domainCheckDue(site: Pick<SiteDomainRow, "custom_domain_status" | "custom_domain_checked_at">, nowMs: number): boolean {
  if (site.custom_domain_status !== "pending" && site.custom_domain_status !== "active") return false;
  const last = site.custom_domain_checked_at ? Date.parse(site.custom_domain_checked_at) : 0;
  const every = site.custom_domain_status === "pending" ? 60_000 : 6 * 60 * 60 * 1000;
  return !Number.isFinite(last) || nowMs - last >= every;
}
