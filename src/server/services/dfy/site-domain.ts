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
  /** Our ownership token (the TXT record), so a domain can't be claimed by pointing a CNAME. */
  token?: string;
  /** When the TXT record was first seen (ownership proven; not re-checked after). */
  verifiedAt?: string | null;
  /** When the domain first went live: a live domain isn't released or dropped during renewals. */
  liveSince?: string | null;
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

/** Our ownership TXT record for a domain (name relative to the domain they bought). PURE. */
export function ownershipRecord(domain: string, token: string, verified: boolean): DnsRecord {
  const label = recordName(domain);
  return { type: "TXT", name: label === "@" ? "_everdoer-verify" : `_everdoer-verify.${label}`, value: `everdoer-verify=${token}`, status: verified ? "VALID" : null };
}

/** The full name to look the ownership record up at. PURE. */
export function ownershipLookupName(domain: string): string {
  return `_everdoer-verify.${domain}`;
}

const HOST_LIVE = new Set(["active", "active_redeploying"]);
/** Certificate states a live domain passes through while renewing (it keeps serving the old cert). */
const SSL_RENEWING = new Set(["pending_validation", "pending_issuance", "pending_deployment", "initializing", "renewing"]);

/**
 * Cloudflare's state (+ our ownership check) → the records to show and whether the domain is live:
 * ownership proven, hostname active (or redeploying), and its certificate active — or, for a
 * domain that has already been live, renewing. PURE.
 */
export function readHostname(
  domain: string,
  target: string,
  h: CloudflareHostname | null | undefined,
  own: { token: string; verified: boolean; liveSince?: string | null } = { token: "", verified: true },
): { dns: DomainDns; active: boolean } {
  const ssl = h?.ssl?.status ?? null;
  const hostLive = HOST_LIVE.has(h?.status ?? "");
  const sslLive = ssl === "active" || (Boolean(own.liveSince) && SSL_RENEWING.has(ssl ?? ""));
  const routed = hostLive && sslLive;
  const active = own.verified && routed;
  const problem =
    [...(h?.verification_errors ?? []), ...((h?.ssl?.validation_errors ?? []).map((e) => e?.message ?? "").filter(Boolean) as string[])]
      .map((m) => m.trim())
      .filter(Boolean)
      .join(" ")
      .slice(0, 300) || null;
  const records: DnsRecord[] = [{ type: "CNAME", name: recordName(domain), value: target, status: routed ? "VALID" : null }];
  if (own.token) records.push(ownershipRecord(domain, own.token, own.verified));
  return {
    dns: { records, certificate: ssl, problem: active ? null : problem, token: own.token || undefined, liveSince: own.liveSince ?? null },
    active,
  };
}

/** TXT values at a name, through Cloudflare's public DNS-over-HTTPS (no DNS library needed). */
export async function resolveTxtOverHttps(name: string, fetchImpl: ApiFetch = (u, i) => fetch(u, i)): Promise<string[]> {
  try {
    const res = await fetchImpl(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=TXT`, {
      method: "GET",
      headers: { accept: "application/dns-json" },
      signal: typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(5000) : undefined,
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { Answer?: Array<{ type?: number; data?: string }> };
    return (body.Answer ?? [])
      .filter((a) => a.type === 16 && typeof a.data === "string")
      .map((a) => (a.data as string).replace(/"\s*"/g, "").replace(/^"|"$/g, "").trim());
  } catch {
    return [];
  }
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
  resolveTxt: (name: string) => Promise<string[]>;
  newToken: () => string;
}

function defaultDeps(): DomainDeps {
  return {
    config: cloudflareConfig(),
    fetch: (url, init) => fetch(url, init),
    now: () => new Date(),
    resolveTxt: (name) => resolveTxtOverHttps(name),
    newToken: () => crypto.randomUUID().replace(/-/g, ""),
  };
}

/** No-change PATCH: Cloudflare re-runs validation now instead of on its backoff (up to 4 h). */
const SSL_SETTINGS = { method: "http", type: "dv", settings: { min_tls_version: "1.2" } };

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
        { hostname: domain, ssl: SSL_SETTINGS },
        deps.fetch,
      );
    } catch (err) {
      if (err instanceof CloudflareApiError && err.status < 500) {
        throw new UserFacingError(`That domain can't be added: ${err.message.replace(/^Cloudflare:\s*/, "")}`);
      }
      throw err;
    }
  }
  const token = deps.newToken();
  const { dns } = readHostname(domain, cfg.target, hostname, { token, verified: false });
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
  const domain = site.custom_domain;
  const prev = (site.custom_domain_dns as unknown as DomainDns | null) ?? { records: [], certificate: null };
  const liveSince = prev.liveSince ?? null;

  // Released only if it never went live: a live domain is never dropped for a blip or a renewal.
  if (!liveSince && site.custom_domain_status === "pending" && site.custom_domain_added_at && deps.now().getTime() - Date.parse(site.custom_domain_added_at) > PENDING_DOMAIN_TTL_MS) {
    await removeSiteDomain(admin, scope, deps);
    return "none";
  }

  // Ownership: our TXT record, checked until it's been seen once.
  const token = prev.token ?? "";
  let verifiedAt = prev.verifiedAt ?? null;
  if (!verifiedAt && token) {
    const values = await deps.resolveTxt(ownershipLookupName(domain));
    if (values.includes(`everdoer-verify=${token}`)) verifiedAt = deps.now().toISOString();
  }
  const verified = Boolean(verifiedAt) || !token; // a domain connected before tokens existed

  let found: CloudflareHostname | null;
  try {
    found = await cf<CloudflareHostname>(cfg, "GET", `/zones/${cfg.zoneId}/custom_hostnames/${ref}`, undefined, deps.fetch);
  } catch (err) {
    if (!isNotFound(err)) throw err;
    found = null;
  }
  const read = found ? readHostname(domain, cfg.target, found, { token, verified, liveSince }) : null;
  const active = read?.active ?? false;
  const dns: DomainDns = read
    ? { ...read.dns, verifiedAt, liveSince: active ? (liveSince ?? deps.now().toISOString()) : liveSince }
    : { records: [], certificate: null, problem: null, token: token || undefined, verifiedAt, liveSince };

  // Not live yet (or Cloudflare moved it): ask Cloudflare to validate again now.
  if (found && !(HOST_LIVE.has(found.status ?? "") && found.ssl?.status === "active")) {
    await cf(cfg, "PATCH", `/zones/${cfg.zoneId}/custom_hostnames/${ref}`, { ssl: SSL_SETTINGS }, deps.fetch).catch(() => undefined);
  }

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
