/** The sites-edge Worker (cloudflare/sites-edge/worker.js) and the one-time Cloudflare setup job. */
import { afterEach, describe, expect, it, vi } from "vitest";

import worker from "../../cloudflare/sites-edge/worker.js";
import { runCloudflareSitesSetup, setupEnv, type Fetcher } from "@/server/jobs/cloudflare-sites-setup";

const env = { ORIGIN: "https://app.everdoer.com", OWN_ZONE: "everdoer.com", EDGE_KEY: "k".repeat(32) };
type WorkerT = { fetch(req: Request, env: Record<string, string>): Promise<Response> };
const w = worker as WorkerT;

afterEach(() => vi.unstubAllGlobals());

describe("sites-edge Worker", () => {
  it("'/' on a business domain → the app's /s/_domain with the signed domain header; query kept; cookies stripped", async () => {
    const upstream = vi.fn(async (_url: URL | string, _init?: RequestInit) => new Response("<html>page</html>", { status: 200, headers: { "content-type": "text/html", "set-cookie": "x=1", vary: "x-everdoer-site-host" } }));
    vi.stubGlobal("fetch", upstream);
    const res = await w.fetch(new Request("https://www.acme.ca/?utm_source=google", { headers: { "user-agent": "UA" } }), env);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("<html>page</html>");
    expect(res.headers.get("set-cookie")).toBeNull();
    const [url, init] = upstream.mock.calls[0];
    expect(String(url)).toBe("https://app.everdoer.com/s/_domain?utm_source=google");
    const headers = new Headers(init?.headers);
    expect(headers.get("x-everdoer-site-host")).toBe("www.acme.ca");
    expect(headers.get("x-everdoer-edge-key")).toBe(env.EDGE_KEY);
  });

  it("any other path on a business domain → its page (the app is never served there); robots.txt allowed", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const login = await w.fetch(new Request("https://www.acme.ca/login"), env);
    expect(login.status).toBe(301);
    expect(login.headers.get("location")).toBe("https://www.acme.ca/");
    const robots = await w.fetch(new Request("https://www.acme.ca/robots.txt"), env);
    expect(await robots.text()).toContain("Allow: /");
    expect((await w.fetch(new Request("https://www.acme.ca/", { method: "POST" }), env)).status).toBe(405);
  });

  it("our own hostnames pass through untouched; the CNAME target answers itself", async () => {
    const passthrough = vi.fn(async () => new Response("app"));
    vi.stubGlobal("fetch", passthrough);
    await w.fetch(new Request("https://app.everdoer.com/login"), env);
    expect(passthrough).toHaveBeenCalledTimes(1);
    const target = await w.fetch(new Request("https://sites.everdoer.com/"), env);
    expect(await target.text()).toBe("Everdoer sites");
    expect(passthrough).toHaveBeenCalledTimes(1);
  });
});

describe("Cloudflare setup job", () => {
  const cfg = { token: "t", zoneId: "zone", accountId: "acct", edgeKey: "k".repeat(32), origin: "https://app.everdoer.com" };

  function fake(state: { dns: Record<string, unknown[]>; fallback: unknown; routes: unknown[]; saasOff?: boolean }) {
    const calls: Array<{ method: string; url: string; body?: unknown }> = [];
    const f: Fetcher = async (url, init) => {
      const path = url.replace("https://api.cloudflare.com/client/v4", "");
      calls.push({ method: init.method, url: path, body: typeof init.body === "string" ? JSON.parse(init.body) : init.body });
      const ok = (result: unknown) => ({ ok: true, status: 200, json: async () => ({ success: true, result }) });
      if (path === "/zones/zone") return ok({ name: "everdoer.com" });
      if (path.startsWith("/zones/zone/dns_records?name=")) return ok(state.dns[decodeURIComponent(path.split("=")[1])] ?? []);
      if (path.endsWith("/fallback_origin") && init.method === "GET") {
        return state.saasOff ? { ok: false, status: 403, json: async () => ({ success: false, errors: [{ code: 1450, message: "SSL for SaaS is not enabled" }] }) } : ok(state.fallback);
      }
      if (path === "/zones/zone/workers/routes" && init.method === "GET") return ok(state.routes);
      return ok({});
    };
    return { f, calls };
  }
  const run = (f: Fetcher, apply: boolean, lines: string[] = []) =>
    runCloudflareSitesSetup(cfg, apply, { fetch: f, workerSource: async () => "export default {}", log: (l) => lines.push(l) });

  it("dry run changes nothing and says what it would do", async () => {
    const { f, calls } = fake({ dns: {}, fallback: null, routes: [] });
    const lines: string[] = [];
    expect(await run(f, false, lines)).toBe(0);
    expect(calls.every((c) => c.method === "GET")).toBe(true);
    expect(lines.join("\n")).toMatch(/would add DNS AAAA sites-origin\.everdoer\.com[\s\S]*would add DNS CNAME sites\.everdoer\.com[\s\S]*would set fallback origin[\s\S]*would upload Worker[\s\S]*would add route/);
  });

  it("apply: DNS (proxied), fallback origin, Worker with bindings, route */*", async () => {
    const { f, calls } = fake({ dns: {}, fallback: null, routes: [] });
    expect(await run(f, true)).toBe(0);
    const writes = calls.filter((c) => c.method !== "GET");
    expect(writes.map((c) => `${c.method} ${c.url}`)).toEqual([
      "POST /zones/zone/dns_records",
      "POST /zones/zone/dns_records",
      "PUT /zones/zone/custom_hostnames/fallback_origin",
      "PUT /accounts/acct/workers/scripts/everdoer-sites-edge",
      "POST /zones/zone/workers/routes",
    ]);
    expect(writes[0].body).toMatchObject({ type: "AAAA", name: "sites-origin.everdoer.com", content: "100::", proxied: true });
    expect(writes[1].body).toMatchObject({ type: "CNAME", name: "sites.everdoer.com", content: "sites-origin.everdoer.com", proxied: true });
    expect(writes[2].body).toEqual({ origin: "sites-origin.everdoer.com" });
    const meta = JSON.parse(String((writes[3].body as FormData).get("metadata")));
    expect(meta.bindings).toEqual([
      { type: "plain_text", name: "ORIGIN", text: "https://app.everdoer.com" },
      { type: "plain_text", name: "OWN_ZONE", text: "everdoer.com" },
      { type: "secret_text", name: "EDGE_KEY", text: cfg.edgeKey },
    ]);
    expect(writes[4].body).toEqual({ pattern: "*/*", script: "everdoer-sites-edge" });
  });

  it("re-run when everything's in place only re-uploads the Worker", async () => {
    const { f, calls } = fake({
      dns: {
        "sites-origin.everdoer.com": [{ id: "1", type: "AAAA", name: "sites-origin.everdoer.com", content: "100::", proxied: true }],
        "sites.everdoer.com": [{ id: "2", type: "CNAME", name: "sites.everdoer.com", content: "sites-origin.everdoer.com", proxied: true }],
      },
      fallback: { origin: "sites-origin.everdoer.com", status: "active" },
      routes: [{ id: "r", pattern: "*/*", script: "everdoer-sites-edge" }],
    });
    expect(await run(f, true)).toBe(0);
    expect(calls.filter((c) => c.method !== "GET").map((c) => c.url)).toEqual(["/accounts/acct/workers/scripts/everdoer-sites-edge"]);
  });

  it("stops (changes nothing) when a name is taken, another Worker owns */*, or Cloudflare for SaaS is off", async () => {
    const taken = fake({ dns: { "sites.everdoer.com": [{ id: "x", type: "A", name: "sites.everdoer.com", content: "1.2.3.4", proxied: false }] }, fallback: null, routes: [] });
    expect(await run(taken.f, true)).toBe(1);
    expect(taken.calls.filter((c) => c.method !== "GET")).toHaveLength(1); // only the sites-origin record before the clash
    const off = fake({ dns: {}, fallback: null, routes: [], saasOff: true });
    const lines: string[] = [];
    expect(await run(off.f, false, lines)).toBe(1);
    expect(lines.join("\n")).toMatch(/Turn on Cloudflare for SaaS/);
    const other = fake({
      dns: {
        "sites-origin.everdoer.com": [{ id: "1", type: "AAAA", name: "sites-origin.everdoer.com", content: "100::", proxied: true }],
        "sites.everdoer.com": [{ id: "2", type: "CNAME", name: "sites.everdoer.com", content: "sites-origin.everdoer.com", proxied: true }],
      },
      fallback: { origin: "sites-origin.everdoer.com" },
      routes: [{ id: "r", pattern: "*/*", script: "someone-else" }],
    });
    expect(await run(other.f, false)).toBe(1);
  });

  it("names what's missing from the env", () => {
    expect(setupEnv({})).toMatch(/CLOUDFLARE_API_TOKEN.*CLOUDFLARE_ZONE_ID.*CLOUDFLARE_ACCOUNT_ID.*SITES_EDGE_KEY.*EVERDOER_APP_BASE_URL/);
    expect(setupEnv({ CLOUDFLARE_API_TOKEN: "t", CLOUDFLARE_ZONE_ID: "z", CLOUDFLARE_ACCOUNT_ID: "a", SITES_EDGE_KEY: "k".repeat(20), EVERDOER_APP_BASE_URL: "https://app.everdoer.com/" })).toMatchObject({ origin: "https://app.everdoer.com" });
  });
});
