/**
 * Everdoer sites edge (docs/custom-domains.md). Runs on the everdoer.com zone for every proxied
 * hostname — in practice the businesses' own domains (Cloudflare for SaaS custom hostnames) plus
 * our CNAME target. Railway only knows our own hostnames, so a business domain is forwarded to the
 * app as /s/_domain with the domain in x-everdoer-site-host, signed with EDGE_KEY.
 *
 * Bindings (set by `npm run job:cloudflare-sites-setup`):
 *   ORIGIN      https://app.everdoer.com (our app)
 *   OWN_ZONE    everdoer.com — our own hostnames pass through untouched
 *   EDGE_KEY    secret shared with the app (SITES_EDGE_KEY)
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const host = url.hostname.toLowerCase();

    // Our own hostnames: never rewritten (if one is ever proxied, it behaves as before).
    if (host === env.OWN_ZONE || host.endsWith(`.${env.OWN_ZONE}`)) {
      if (host.startsWith("sites.") || host.startsWith("sites-origin.")) {
        return new Response("Everdoer sites", { status: 200, headers: { "content-type": "text/plain" } });
      }
      return fetch(request);
    }

    // Certificate validation (Cloudflare's HTTP DCV, at issue and every renewal) must reach
    // Cloudflare untouched: never redirect or forward these.
    if (url.pathname.startsWith("/.well-known/")) {
      return fetch(request);
    }
    if (url.protocol === "http:") {
      return Response.redirect(`https://${host}${url.pathname}${url.search}`, 301);
    }
    if (url.pathname === "/robots.txt") {
      return new Response(`User-agent: *\nAllow: /\n`, { headers: { "content-type": "text/plain", "cache-control": "public, max-age=3600" } });
    }
    // The business's page is a single page: anything else goes to it (the app is never served here).
    if (url.pathname !== "/") {
      return Response.redirect(`https://${host}/${url.search}`, 301);
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405, headers: { allow: "GET, HEAD" } });
    }

    const upstream = new URL("/s/_domain", env.ORIGIN);
    upstream.search = url.search;
    const headers = new Headers({
      "x-everdoer-site-host": host,
      "x-everdoer-edge-key": env.EDGE_KEY,
      accept: request.headers.get("accept") ?? "text/html",
      "user-agent": request.headers.get("user-agent") ?? "",
    });
    const etag = request.headers.get("if-none-match");
    if (etag) headers.set("if-none-match", etag);
    const ip = request.headers.get("cf-connecting-ip");
    if (ip) headers.set("x-forwarded-for", ip);
    // Every business domain is the same upstream URL: never let a cache share it between them.
    const res = await fetch(upstream, { method: request.method, headers, redirect: "manual", cf: { cacheTtl: 0, cacheEverything: false } });
    const out = new Response(res.body, res);
    out.headers.delete("set-cookie");
    out.headers.set("x-served-by", "everdoer-sites-edge");
    return out;
  },
};
