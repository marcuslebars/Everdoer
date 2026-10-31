// ─────────────────────────────────────────────────────────────────────────────
// SANCTIONED EXCEPTION (service role): Settings → Your website → your own domain. The route
// checks org membership (owner/admin) and that the company is the org's on the caller's RLS
// client first; only then does this write that one company's company_sites domain columns.
// docs/done-for-you.md → "Generated sites" → "Images and your own domain".
//
// The domain is added to the web service in Railway through its public API (customDomainCreate),
// which also issues the HTTPS certificate once DNS points at it. Env [web]:
//   RAILWAY_API_TOKEN    an account or workspace token (Railway → Account → Tokens)
//   RAILWAY_PROJECT_ID / RAILWAY_ENVIRONMENT_ID / RAILWAY_SERVICE_ID
//                        set by Railway itself on every deploy; the web service's own ids
// Without the token, connecting a domain is refused with a plain message.
// ─────────────────────────────────────────────────────────────────────────────
import type { Json, Tables } from "@/server/db/database.types";
import { UserFacingError } from "@/server/errors";
import type { AdminClient } from "@/server/services/done-for-you/purchases";

const RAILWAY_API = "https://backboard.railway.com/graphql/v2";

type Scope = { organizationId: string; companyId: string };

export type DomainStatus = "none" | "pending" | "active";

/** A DNS record the owner adds at their domain provider. */
export interface DnsRecord {
  type: "CNAME" | "TXT";
  /** The "Name"/"Host" field, relative to the domain they bought ("@" = the domain itself). */
  name: string;
  value: string;
  /** Railway's check of this record: PENDING / VALID / INVALID (TXT isn't reported). */
  status: string | null;
}

export interface DomainDns {
  records: DnsRecord[];
  certificate: string | null;
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

/** "www.acme.ca" in zone "acme.ca" → "www"; the zone itself → "@". PURE. */
export function relativeName(host: string | null | undefined, zone: string | null | undefined): string {
  const h = (host ?? "").trim().replace(/\.$/, "").toLowerCase();
  const z = (zone ?? "").trim().replace(/\.$/, "").toLowerCase();
  if (!h || h === "@" || (z && h === z)) return "@";
  return z && h.endsWith(`.${z}`) ? h.slice(0, -(z.length + 1)) : h;
}

/** Railway's ownership TXT record (status.verificationDnsHost / verificationToken). PURE. */
export function verificationRecord(name: string, token: string, verified = false): DnsRecord {
  const value = token.startsWith("railway-verify=") ? token : `railway-verify=${token}`;
  return { type: "TXT", name, value, status: verified ? "VALID" : null };
}

/** Railway's CustomDomainStatus (public GraphQL schema, checked by introspection Nov 2026). */
interface RailwayDomainStatus {
  verified?: boolean | null;
  verificationDnsHost?: string | null;
  verificationToken?: string | null;
  certificateStatus?: string | null;
  dnsRecords?: Array<{
    hostlabel?: string | null;
    zone?: string | null;
    recordType?: string | null;
    purpose?: string | null;
    requiredValue?: string | null;
    currentValue?: string | null;
    status?: string | null;
  } | null> | null;
}

const PROPAGATED = "DNS_RECORD_STATUS_PROPAGATED";
const CERT_VALID = "CERTIFICATE_STATUS_TYPE_VALID";

function recordType(raw: string | null | undefined): DnsRecord["type"] | null {
  if (raw === "DNS_RECORD_TYPE_CNAME") return "CNAME";
  if (raw === "DNS_RECORD_TYPE_TXT") return "TXT";
  return null; // A / NS / unknown: Railway doesn't ask for these on a custom domain
}

/**
 * Railway's status → the records to show and whether the domain is live: ownership verified
 * (the TXT record), every routing record propagated, and the HTTPS certificate issued. PURE.
 */
export function readRailwayStatus(domain: string, status: RailwayDomainStatus | null | undefined): { dns: DomainDns; active: boolean } {
  const records: DnsRecord[] = [];
  let zone: string | null = null;
  for (const r of status?.dnsRecords ?? []) {
    const type = recordType(r?.recordType);
    if (!r || !type || !r.requiredValue) continue;
    zone = zone ?? r.zone ?? null;
    const host = r.hostlabel && r.zone && !r.hostlabel.includes(".") ? (r.hostlabel === "@" || r.hostlabel === "" ? r.zone : `${r.hostlabel}.${r.zone}`) : r.hostlabel || domain;
    records.push({ type, name: relativeName(host, r.zone ?? zone), value: r.requiredValue.replace(/\.$/, ""), status: r.status === PROPAGATED ? "VALID" : null });
  }
  if (status?.verificationToken) {
    const host = status.verificationDnsHost?.trim() || `_railway-verify.${domain}`;
    const name = relativeName(host.includes(".") || !zone ? host : `${host}.${zone}`, zone);
    records.push(verificationRecord(name, status.verificationToken, status.verified === true));
  }
  const certificate = status?.certificateStatus ?? null;
  const routing = (status?.dnsRecords ?? []).filter((r) => r && r.purpose !== "DNS_RECORD_PURPOSE_ACME_DNS01_CHALLENGE" && recordType(r.recordType));
  const active = status?.verified === true && routing.length > 0 && routing.every((r) => r?.status === PROPAGATED) && certificate === CERT_VALID;
  return { dns: { records, certificate }, active };
}

export interface RailwayConfig {
  token: string;
  projectId: string;
  environmentId: string;
  serviceId: string;
  targetPort: number | null;
}

export function railwayConfig(env: NodeJS.ProcessEnv = process.env): RailwayConfig | null {
  const token = env.RAILWAY_API_TOKEN?.trim();
  const projectId = env.RAILWAY_PROJECT_ID?.trim();
  const environmentId = env.RAILWAY_ENVIRONMENT_ID?.trim();
  const serviceId = env.RAILWAY_SERVICE_ID?.trim();
  if (!token || !projectId || !environmentId || !serviceId) return null;
  const port = Number(env.PORT);
  return { token, projectId, environmentId, serviceId, targetPort: Number.isInteger(port) && port > 0 ? port : null };
}

export type RailwayFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** A Railway call that took too long, or Railway being down: the owner gets "try again". */
export class RailwayUnavailableError extends UserFacingError {
  constructor() {
    super("We couldn't reach our hosting provider just now. Try again in a minute.", { status: 503 });
  }
}

async function railwayGql<T>(cfg: RailwayConfig, query: string, variables: Record<string, unknown>, fetchImpl: RailwayFetch): Promise<T> {
  const signal = typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(8000) : undefined;
  let res: Awaited<ReturnType<RailwayFetch>>;
  try {
    res = await fetchImpl(RAILWAY_API, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${cfg.token}` },
      body: JSON.stringify({ query, variables }),
      signal,
    });
  } catch {
    throw new RailwayUnavailableError();
  }
  const body = (await res.json().catch(() => ({}))) as { data?: T; errors?: Array<{ message?: string }> };
  if (res.status >= 500) throw new RailwayUnavailableError();
  if (!res.ok || body.errors?.length || !body.data) {
    const message = body.errors?.map((e) => e.message).filter(Boolean).join("; ") || `HTTP ${res.status}`;
    throw new Error(`Railway: ${message}`);
  }
  return body.data;
}

const STATUS_FIELDS =
  "status { verified verificationDnsHost verificationToken certificateStatus dnsRecords { hostlabel zone recordType purpose requiredValue currentValue status } }";

/** How many sites may have a domain connected at once (Railway caps custom domains per service). */
export function siteDomainCap(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.SITE_DOMAINS_MAX);
  return Number.isInteger(n) && n >= 0 ? n : 15;
}

/** A domain still waiting on DNS after this long is released (frees the slot and the name). */
export const PENDING_DOMAIN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface DomainDeps {
  config: RailwayConfig | null;
  fetch: RailwayFetch;
  now: () => Date;
}

function defaultDeps(): DomainDeps {
  return { config: railwayConfig(), fetch: (url, init) => fetch(url, init), now: () => new Date() };
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

/** Our web service's custom domains in Railway, by name → id. */
async function serviceDomains(cfg: RailwayConfig, fetchImpl: RailwayFetch): Promise<Map<string, string>> {
  const res = await railwayGql<{ domains: { customDomains: Array<{ id: string; domain: string }> } }>(
    cfg,
    "query($projectId: String!, $environmentId: String!, $serviceId: String!) { domains(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId) { customDomains { id domain } } }",
    { projectId: cfg.projectId, environmentId: cfg.environmentId, serviceId: cfg.serviceId },
    fetchImpl,
  );
  return new Map((res.domains?.customDomains ?? []).map((d) => [d.domain.toLowerCase(), d.id]));
}

/** If the site's quote form only accepts listed websites, the domain must be on that list. */
async function allowOnSiteForm(admin: AdminClient, scope: Scope, domain: string): Promise<void> {
  const { data } = await admin
    .from("public_form_keys")
    .select("id, allowed_origins, form_type")
    .eq("organization_id", scope.organizationId)
    .eq("company_id", scope.companyId)
    .eq("active", true);
  const origin = `https://${domain}`;
  for (const key of (data ?? []) as Array<{ id: string; allowed_origins: string[] | null }>) {
    const list = key.allowed_origins ?? [];
    if (list.length === 0 || list.includes(origin)) continue; // open to any site already
    await admin.from("public_form_keys").update({ allowed_origins: [...list, origin] }).eq("id", key.id);
  }
}

/** Add the business's domain: Railway starts routing it once DNS points there. */
export async function connectSiteDomain(admin: AdminClient, scope: Scope, input: string, deps: DomainDeps = defaultDeps()): Promise<void> {
  const domain = normalizeDomain(input);
  const site = await loadSite(admin, scope);
  if (!site) throw new UserFacingError("Create your page first, then connect your domain.");
  if (site.custom_domain) throw new UserFacingError("Remove the current domain first.");
  if (!deps.config) throw new UserFacingError("Connecting your own domain isn't switched on yet. Contact support and we'll set it up.");
  const { data: taken } = await admin.from("company_sites").select("id").eq("custom_domain", domain).maybeSingle();
  if (taken) throw new UserFacingError("That domain is already connected to another business.");
  const { data: inUse } = await admin.from("company_sites").select("id").not("custom_domain", "is", null);
  if (((inUse ?? []) as unknown[]).length >= siteDomainCap()) {
    throw new UserFacingError("We can't connect more domains right now. Contact support and we'll add yours.");
  }

  // Already on our service in Railway (an earlier attempt whose reply was lost): take it over
  // rather than failing "already in use" forever. Nothing in our DB claims it (checked above).
  const existing = (await serviceDomains(deps.config, deps.fetch)).get(domain) ?? null;
  let ref = existing;
  let status: RailwayDomainStatus | undefined;
  if (!ref) {
    const available = await railwayGql<{ customDomainAvailable: { available: boolean; message?: string | null } }>(
      deps.config,
      "query($domain: String!) { customDomainAvailable(domain: $domain) { available message } }",
      { domain },
      deps.fetch,
    );
    if (!available.customDomainAvailable.available) {
      throw new UserFacingError(`That domain can't be added: ${available.customDomainAvailable.message || "it's already in use somewhere else"}.`);
    }
    const created = await railwayGql<{ customDomainCreate: { id: string; domain: string; status?: RailwayDomainStatus } }>(
      deps.config,
      `mutation($input: CustomDomainCreateInput!) { customDomainCreate(input: $input) { id domain ${STATUS_FIELDS} } }`,
      {
        input: {
          domain,
          projectId: deps.config.projectId,
          environmentId: deps.config.environmentId,
          serviceId: deps.config.serviceId,
          ...(deps.config.targetPort ? { targetPort: deps.config.targetPort } : {}),
        },
      },
      deps.fetch,
    );
    ref = created.customDomainCreate.id;
    status = created.customDomainCreate.status;
  }
  const { dns } = readRailwayStatus(domain, status);
  const now = deps.now().toISOString();
  const { error } = await admin
    .from("company_sites")
    .update({
      custom_domain: domain,
      custom_domain_ref: ref,
      custom_domain_status: "pending",
      custom_domain_dns: dns as unknown as Json,
      custom_domain_checked_at: existing ? null : now, // an adopted domain is checked straight away
      custom_domain_added_at: now,
    })
    .eq("id", site.id)
    .is("custom_domain", null);
  if (error) {
    // Don't leave a domain in Railway that nothing points to (one we just created).
    if (!existing) await railwayGql(deps.config, "mutation($id: String!) { customDomainDelete(id: $id) }", { id: ref }, deps.fetch).catch(() => undefined);
    if ((error as { code?: string }).code === "23505") throw new UserFacingError("That domain is already connected to another business.");
    throw error;
  }
  await allowOnSiteForm(admin, scope, domain).catch((err) => console.error("[site-domain] couldn't allow the domain on the form:", err instanceof Error ? err.message : err));
  if (existing) await checkSiteDomain(admin, scope, deps).catch(() => undefined);
}

function isNotFound(err: unknown): boolean {
  return err instanceof Error && /not found|does not exist|no custom ?domain/i.test(err.message);
}

/**
 * Ask Railway whether DNS is in place yet; the domain goes live once it is. A domain still waiting
 * after a week is released; a live one that disappeared from Railway goes back to waiting.
 */
export async function checkSiteDomain(admin: AdminClient, scope: Scope, deps: DomainDeps = defaultDeps()): Promise<DomainStatus> {
  const site = await loadSite(admin, scope);
  if (!site?.custom_domain || !site.custom_domain_ref) return "none";
  if (!deps.config) return site.custom_domain_status as DomainStatus;
  const ref = site.custom_domain_ref;

  if (site.custom_domain_status === "pending" && site.custom_domain_added_at && deps.now().getTime() - Date.parse(site.custom_domain_added_at) > PENDING_DOMAIN_TTL_MS) {
    await removeSiteDomain(admin, scope, deps);
    return "none";
  }

  let found: { status?: RailwayDomainStatus } | null;
  try {
    const res = await railwayGql<{ customDomain: { status?: RailwayDomainStatus } | null }>(
      deps.config,
      `query($id: String!, $projectId: String!) { customDomain(id: $id, projectId: $projectId) { id ${STATUS_FIELDS} } }`,
      { id: ref, projectId: deps.config.projectId },
      deps.fetch,
    );
    found = res.customDomain;
  } catch (err) {
    if (!isNotFound(err)) throw err;
    found = null;
  }
  const { dns, active } = found
    ? readRailwayStatus(site.custom_domain, found.status)
    : { dns: { records: [], certificate: null } as DomainDns, active: false };
  if (found && !dns.records.some((r) => r.type === "TXT")) {
    // Keep the TXT record shown once known (Railway may stop returning the token after it verifies).
    dns.records.push(...((site.custom_domain_dns as unknown as DomainDns | null)?.records ?? []).filter((r) => r.type === "TXT"));
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

/** Disconnect the domain (removed from Railway too). */
export async function removeSiteDomain(admin: AdminClient, scope: Scope, deps: DomainDeps = defaultDeps()): Promise<void> {
  const site = await loadSite(admin, scope);
  if (!site?.custom_domain) return;
  if (site.custom_domain_ref) {
    // Clearing our side while the domain stays on the service would serve the app on it and
    // block reconnecting, so a failed delete is reported and the domain kept. Already gone is fine.
    if (!deps.config) throw new UserFacingError("Disconnecting isn't available right now. Contact support and we'll remove it.");
    try {
      await railwayGql(deps.config, "mutation($id: String!) { customDomainDelete(id: $id) }", { id: site.custom_domain_ref }, deps.fetch);
    } catch (err) {
      if (!isNotFound(err)) {
        console.error("[site-domain] Railway delete failed:", err instanceof Error ? err.message : err);
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
 * hours (in case it was removed in Railway). PURE.
 */
export function domainCheckDue(site: Pick<SiteDomainRow, "custom_domain_status" | "custom_domain_checked_at">, nowMs: number): boolean {
  if (site.custom_domain_status !== "pending" && site.custom_domain_status !== "active") return false;
  const last = site.custom_domain_checked_at ? Date.parse(site.custom_domain_checked_at) : 0;
  const every = site.custom_domain_status === "pending" ? 60_000 : 6 * 60 * 60 * 1000;
  return !Number.isFinite(last) || nowMs - last >= every;
}
