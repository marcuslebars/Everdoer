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
  if (d.length > 253 || !/^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(d)) {
    throw new UserFacingError("That doesn't look like a domain. Type it like www.yourbusiness.com.");
  }
  if (RESERVED_SUFFIXES.some((s) => d === s || d.endsWith(`.${s}`))) {
    throw new UserFacingError("That domain can't be used. Use a domain your business owns.");
  }
  return d;
}

/** The label to put in the DNS "Name" field for `domain` (Railway's hostlabel, "@" for the root). PURE. */
export function hostLabel(domain: string, railwayLabel: string | null | undefined): string {
  const l = (railwayLabel ?? "").trim();
  if (l && l !== domain) return l === "@" ? "@" : l.replace(/\.$/, "");
  return "@";
}

/**
 * Railway's ownership TXT record. Railway returns only the token (status.verificationToken); the
 * dashboard shows it as name "_railway-verify" (".<sub>" for a subdomain) and value
 * "railway-verify=<token>". Kept in one place so it's easy to adjust. PURE.
 */
export function verificationRecord(label: string, token: string): DnsRecord {
  const value = token.startsWith("railway-verify=") ? token : `railway-verify=${token}`;
  return { type: "TXT", name: label === "@" ? "_railway-verify" : `_railway-verify.${label}`, value, status: null };
}

interface RailwayDomainStatus {
  verificationToken?: string | null;
  certificateStatus?: string | null;
  dnsRecords?: Array<{ hostlabel?: string | null; requiredValue?: string | null; currentValue?: string | null; status?: string | null; recordType?: string | null }> | null;
}

/** Railway's status → the records to show and whether the domain is live. PURE. */
export function readRailwayStatus(domain: string, status: RailwayDomainStatus | null | undefined): { dns: DomainDns; active: boolean } {
  const records: DnsRecord[] = [];
  let label = "@";
  for (const r of status?.dnsRecords ?? []) {
    if (!r?.requiredValue) continue;
    label = hostLabel(domain, r.hostlabel);
    records.push({ type: "CNAME", name: label, value: r.requiredValue.replace(/\.$/, ""), status: r.status ?? null });
  }
  if (status?.verificationToken) records.push(verificationRecord(label, status.verificationToken));
  const routing = records.filter((r) => r.type === "CNAME");
  const certificate = status?.certificateStatus ?? null;
  const active = routing.length > 0 && routing.every((r) => r.status === "VALID") && (certificate === null || certificate === "ISSUED" || certificate === "CERTIFICATE_STATUS_TYPE_VALID");
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

export type RailwayFetch = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

async function railwayGql<T>(cfg: RailwayConfig, query: string, variables: Record<string, unknown>, fetchImpl: RailwayFetch): Promise<T> {
  const res = await fetchImpl(RAILWAY_API, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${cfg.token}` },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await res.json().catch(() => ({}))) as { data?: T; errors?: Array<{ message?: string }> };
  if (!res.ok || body.errors?.length || !body.data) {
    const message = body.errors?.map((e) => e.message).filter(Boolean).join("; ") || `HTTP ${res.status}`;
    throw new Error(`Railway: ${message}`);
  }
  return body.data;
}

const STATUS_FIELDS = "status { verificationToken certificateStatus dnsRecords { hostlabel requiredValue currentValue status } }";

export interface DomainDeps {
  config: RailwayConfig | null;
  fetch: RailwayFetch;
  now: () => Date;
}

function defaultDeps(): DomainDeps {
  return { config: railwayConfig(), fetch: (url, init) => fetch(url, init), now: () => new Date() };
}

type SiteDomainRow = Pick<Tables<"company_sites">, "id" | "custom_domain" | "custom_domain_ref" | "custom_domain_status" | "custom_domain_dns" | "custom_domain_checked_at">;

async function loadSite(admin: AdminClient, scope: Scope): Promise<SiteDomainRow | null> {
  const { data, error } = await admin
    .from("company_sites")
    .select("id, custom_domain, custom_domain_ref, custom_domain_status, custom_domain_dns, custom_domain_checked_at")
    .eq("organization_id", scope.organizationId)
    .eq("company_id", scope.companyId)
    .maybeSingle();
  if (error) throw error;
  return data as SiteDomainRow | null;
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

  const available = await railwayGql<{ customDomainAvailable: { available: boolean; message?: string | null } }>(
    deps.config,
    "query($domain: String!) { customDomainAvailable(domain: $domain) { available message } }",
    { domain },
    deps.fetch,
  ).catch(() => null);
  if (available && !available.customDomainAvailable.available) {
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
  const { dns } = readRailwayStatus(domain, created.customDomainCreate.status);
  const { error } = await admin
    .from("company_sites")
    .update({
      custom_domain: domain,
      custom_domain_ref: created.customDomainCreate.id,
      custom_domain_status: "pending",
      custom_domain_dns: dns as unknown as Json,
      custom_domain_checked_at: deps.now().toISOString(),
    })
    .eq("id", site.id);
  if (error) {
    // Don't leave a domain in Railway that nothing points to.
    await railwayGql(deps.config, "mutation($id: String!) { customDomainDelete(id: $id) }", { id: created.customDomainCreate.id }, deps.fetch).catch(() => undefined);
    if ((error as { code?: string }).code === "23505") throw new UserFacingError("That domain is already connected to another business.");
    throw error;
  }
}

/** Ask Railway whether DNS is in place yet; the domain goes live once it is. */
export async function checkSiteDomain(admin: AdminClient, scope: Scope, deps: DomainDeps = defaultDeps()): Promise<DomainStatus> {
  const site = await loadSite(admin, scope);
  if (!site?.custom_domain || !site.custom_domain_ref) return "none";
  if (!deps.config) return site.custom_domain_status as DomainStatus;
  const res = await railwayGql<{ customDomain: { status?: RailwayDomainStatus } | null }>(
    deps.config,
    `query($id: String!, $projectId: String!) { customDomain(id: $id, projectId: $projectId) { id ${STATUS_FIELDS} } }`,
    { id: site.custom_domain_ref, projectId: deps.config.projectId },
    deps.fetch,
  );
  const { dns, active } = readRailwayStatus(site.custom_domain, res.customDomain?.status);
  // Keep the TXT record shown once known (Railway may stop returning the token after it verifies).
  const before = (site.custom_domain_dns as unknown as DomainDns | null)?.records ?? [];
  if (!dns.records.some((r) => r.type === "TXT")) dns.records.push(...before.filter((r) => r.type === "TXT"));
  const status: DomainStatus = active ? "active" : "pending";
  const { error } = await admin
    .from("company_sites")
    .update({ custom_domain_status: status, custom_domain_dns: dns as unknown as Json, custom_domain_checked_at: deps.now().toISOString() })
    .eq("id", site.id);
  if (error) throw error;
  return status;
}

/** Disconnect the domain (removed from Railway too). */
export async function removeSiteDomain(admin: AdminClient, scope: Scope, deps: DomainDeps = defaultDeps()): Promise<void> {
  const site = await loadSite(admin, scope);
  if (!site?.custom_domain) return;
  if (site.custom_domain_ref && deps.config) {
    try {
      await railwayGql(deps.config, "mutation($id: String!) { customDomainDelete(id: $id) }", { id: site.custom_domain_ref }, deps.fetch);
    } catch (err) {
      // Already gone in Railway is fine; anything else is worth knowing about but mustn't trap the owner.
      console.error("[site-domain] Railway delete failed (remove it by hand if it's still listed):", err instanceof Error ? err.message : err);
    }
  }
  const { error } = await admin
    .from("company_sites")
    .update({ custom_domain: null, custom_domain_ref: null, custom_domain_status: "none", custom_domain_dns: null, custom_domain_checked_at: null })
    .eq("id", site.id);
  if (error) throw error;
}

/** A pending domain is re-checked when Settings is opened, at most once a minute. PURE. */
export function domainCheckDue(site: Pick<SiteDomainRow, "custom_domain_status" | "custom_domain_checked_at">, nowMs: number): boolean {
  if (site.custom_domain_status !== "pending") return false;
  const last = site.custom_domain_checked_at ? Date.parse(site.custom_domain_checked_at) : 0;
  return !Number.isFinite(last) || nowMs - last >= 60_000;
}
