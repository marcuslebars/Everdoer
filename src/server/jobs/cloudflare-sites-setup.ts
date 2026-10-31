/**
 * One-time (re-runnable) Cloudflare setup for business domains (docs/custom-domains.md):
 *
 *   1. DNS on the everdoer.com zone: `sites-origin` (AAAA 100::, proxied: the Worker answers, so it
 *      needs no real origin) and `sites` (CNAME → sites-origin, proxied) — the address owners
 *      point their domain at.
 *   2. Cloudflare for SaaS fallback origin = sites-origin.<zone>.
 *   3. The sites-edge Worker (cloudflare/sites-edge/worker.js) with its bindings.
 *   4. A Worker route `*\/*` on the zone, so it runs for every business domain.
 *
 *   npm run job:cloudflare-sites-setup              # dry run: what it would change
 *   npm run job:cloudflare-sites-setup -- --apply   # do it
 *
 * Env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ZONE_ID, CLOUDFLARE_ACCOUNT_ID, SITES_EDGE_KEY,
 * EVERDOER_APP_BASE_URL (or APP_BASE_URL). The token needs, on the zone: DNS Edit, SSL and
 * Certificates Edit, Workers Routes Edit; on the account: Workers Scripts Edit.
 * Cloudflare for SaaS must be turned on first (SSL/TLS → Custom Hostnames).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

const API = "https://api.cloudflare.com/client/v4";
export const SITES_WORKER_NAME = "everdoer-sites-edge";

export interface SetupEnv {
  token: string;
  zoneId: string;
  accountId: string;
  edgeKey: string;
  origin: string;
}

export function setupEnv(env: Record<string, string | undefined> = process.env): SetupEnv | string {
  const token = env.CLOUDFLARE_API_TOKEN?.trim();
  const zoneId = env.CLOUDFLARE_ZONE_ID?.trim();
  const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const edgeKey = env.SITES_EDGE_KEY?.trim();
  const origin = (env.EVERDOER_APP_BASE_URL || env.APP_BASE_URL || "").trim().replace(/\/+$/, "");
  const missing = [
    !token && "CLOUDFLARE_API_TOKEN",
    !zoneId && "CLOUDFLARE_ZONE_ID",
    !accountId && "CLOUDFLARE_ACCOUNT_ID",
    (!edgeKey || edgeKey.length < 16) && "SITES_EDGE_KEY (16+ characters)",
    !/^https:\/\//.test(origin) && "EVERDOER_APP_BASE_URL (https)",
  ].filter(Boolean);
  if (missing.length) return `Missing: ${missing.join(", ")}`;
  return { token: token!, zoneId: zoneId!, accountId: accountId!, edgeKey: edgeKey!, origin };
}

export type Fetcher = (url: string, init: { method: string; headers: Record<string, string>; body?: string | FormData }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

async function call<T>(f: Fetcher, env: SetupEnv, method: string, p: string, body?: unknown, form?: FormData): Promise<T> {
  const headers: Record<string, string> = { authorization: `Bearer ${env.token}` };
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await f(`${API}${p}`, { method, headers, body: form ?? (body === undefined ? undefined : JSON.stringify(body)) });
  const json = (await res.json().catch(() => ({}))) as { success?: boolean; result?: T; errors?: Array<{ code?: number; message?: string }> };
  if (!res.ok || json.success === false) {
    throw new Error(`${method} ${p}: ${(json.errors ?? []).map((e) => `${e.code ?? ""} ${e.message ?? ""}`.trim()).join("; ") || `HTTP ${res.status}`}`);
  }
  return json.result as T;
}

interface DnsRecord {
  id: string;
  type: string;
  name: string;
  content: string;
  proxied: boolean;
}

export async function runCloudflareSitesSetup(
  env: SetupEnv,
  apply: boolean,
  deps: { fetch: Fetcher; workerSource: () => Promise<string>; log: (line: string) => void } = {
    fetch: (url, init) => fetch(url, init),
    workerSource: () => readFile(path.join(process.cwd(), "cloudflare", "sites-edge", "worker.js"), "utf8"),
    log: (line) => console.log(line),
  },
): Promise<number> {
  const { log } = deps;
  const zone = await call<{ name: string }>(deps.fetch, env, "GET", `/zones/${env.zoneId}`);
  const own = zone.name.toLowerCase();
  const originHost = `sites-origin.${own}`;
  const targetHost = `sites.${own}`;
  log(`Zone: ${own}. Owners will point their domain at ${targetHost}.`);

  // 1. DNS
  const wanted = [
    { type: "AAAA", name: originHost, content: "100::", proxied: true, comment: "Everdoer sites: fallback origin (answered by the sites-edge Worker)" },
    { type: "CNAME", name: targetHost, content: originHost, proxied: true, comment: "Everdoer sites: what business domains CNAME to" },
  ];
  for (const rec of wanted) {
    const existing = await call<DnsRecord[]>(deps.fetch, env, "GET", `/zones/${env.zoneId}/dns_records?name=${encodeURIComponent(rec.name)}`);
    const same = existing.find((e) => e.type === rec.type && e.content.toLowerCase() === rec.content.toLowerCase() && e.proxied);
    if (same) {
      log(`ok    DNS ${rec.type} ${rec.name} → ${rec.content} (proxied)`);
    } else if (existing.length) {
      log(`STOP  ${rec.name} already has other records (${existing.map((e) => `${e.type} ${e.content}`).join(", ")}). Remove them, then run again.`);
      return 1;
    } else if (apply) {
      await call(deps.fetch, env, "POST", `/zones/${env.zoneId}/dns_records`, { ...rec, ttl: 1 });
      log(`added DNS ${rec.type} ${rec.name} → ${rec.content} (proxied)`);
    } else {
      log(`would add DNS ${rec.type} ${rec.name} → ${rec.content} (proxied)`);
    }
  }

  // 2. Fallback origin
  let fallback: { origin?: string; status?: string } | null = null;
  try {
    fallback = await call<{ origin?: string; status?: string }>(deps.fetch, env, "GET", `/zones/${env.zoneId}/custom_hostnames/fallback_origin`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/not found|1551|does not exist/i.test(msg)) {
      log(`STOP  Couldn't read the Cloudflare for SaaS fallback origin (${msg}). Turn on Cloudflare for SaaS: dashboard → everdoer.com → SSL/TLS → Custom Hostnames.`);
      return 1;
    }
  }
  if (fallback?.origin === originHost) {
    log(`ok    fallback origin ${originHost} (${fallback.status ?? "?"})`);
  } else if (apply) {
    await call(deps.fetch, env, "PUT", `/zones/${env.zoneId}/custom_hostnames/fallback_origin`, { origin: originHost });
    log(`set   fallback origin ${originHost}`);
  } else {
    log(`would set fallback origin ${originHost}${fallback?.origin ? ` (now ${fallback.origin})` : ""}`);
  }

  // 3. Worker
  const source = await deps.workerSource();
  if (apply) {
    const form = new FormData();
    form.append(
      "metadata",
      JSON.stringify({
        main_module: "worker.js",
        compatibility_date: "2026-10-01",
        bindings: [
          { type: "plain_text", name: "ORIGIN", text: env.origin },
          { type: "plain_text", name: "OWN_ZONE", text: own },
          { type: "secret_text", name: "EDGE_KEY", text: env.edgeKey },
        ],
      }),
    );
    form.append("worker.js", new Blob([source], { type: "application/javascript+module" }), "worker.js");
    await call(deps.fetch, env, "PUT", `/accounts/${env.accountId}/workers/scripts/${SITES_WORKER_NAME}`, undefined, form);
    log(`put   Worker ${SITES_WORKER_NAME} (ORIGIN=${env.origin})`);
  } else {
    log(`would upload Worker ${SITES_WORKER_NAME} (${source.length} bytes, ORIGIN=${env.origin})`);
  }

  // 4. Route
  const routes = await call<Array<{ id: string; pattern: string; script?: string }>>(deps.fetch, env, "GET", `/zones/${env.zoneId}/workers/routes`);
  const route = routes.find((r) => r.pattern === "*/*");
  if (route?.script === SITES_WORKER_NAME) {
    log("ok    route */* → Worker");
  } else if (route) {
    log(`STOP  Route */* already runs another Worker (${route.script ?? "none"}). Not changing it.`);
    return 1;
  } else if (apply) {
    await call(deps.fetch, env, "POST", `/zones/${env.zoneId}/workers/routes`, { pattern: "*/*", script: SITES_WORKER_NAME });
    log("added route */* → Worker");
  } else {
    log("would add route */* → Worker");
  }

  if (!apply) log("\n(dry run - pass --apply to make these changes)");
  return 0;
}

if (process.argv[1]?.endsWith("cloudflare-sites-setup.ts")) {
  const env = setupEnv();
  if (typeof env === "string") {
    console.error(`[cloudflare-sites-setup] ${env}`);
    process.exit(1);
  }
  runCloudflareSitesSetup(env, process.argv.includes("--apply"))
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error("[cloudflare-sites-setup] FAILED:", err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
