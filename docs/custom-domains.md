# Business domains (Cloudflare for SaaS)

A business can show its Everdoer website on its own domain, like `www.acmeroofing.ca`
(Settings → Your website → Your own domain). It works for every customer, with no per-service
domain cap.

## How it works

```
visitor ─► www.acmeroofing.ca ──CNAME──► sites.everdoer.com
             │  Cloudflare (everdoer.com zone, Cloudflare for SaaS custom hostname, its own cert)
             ▼
           sites-edge Worker (route */*)
             │  "/" → https://app.everdoer.com/s/_domain
             │        x-everdoer-site-host: www.acmeroofing.ca
             │        x-everdoer-edge-key:  SITES_EDGE_KEY
             ▼
           Railway (our app; only ever sees app.everdoer.com) → that business's page
```

- **Custom hostnames.** Each business domain is a Cloudflare for SaaS custom hostname on the
  everdoer.com zone, created through the API with HTTP validation. Once the owner's CNAME points
  at `sites.everdoer.com`, Cloudflare validates the domain and issues its certificate. The domain
  goes `active` when both the hostname and its certificate are active.
- **The sites-edge Worker** (`cloudflare/sites-edge/worker.js`) runs on the zone's `*/*` route.
  - Only proxied hostnames reach it. Those are the businesses' domains and `sites` /
    `sites-origin`. Our own records (`app`, `api`, the apex) are DNS-only, and if one is ever
    proxied it passes straight through.
  - On a business domain, `/` is forwarded to the app with the domain in a header signed by
    `SITES_EDGE_KEY`. That request is never cached, because every business shares the same
    upstream URL.
  - `/.well-known/*` passes straight through to Cloudflare. Certificate validation, both the
    first issue and every renewal, depends on it.
  - Plain http redirects to https.
  - Every other path redirects to `/`, so the Everdoer app is never served on a customer's
    domain. `robots.txt` allows crawling.
- **The app** (`src/app/s/[slug]/route.ts`, slug `_domain`) trusts the domain header only with
  the right key (`edgeSiteHost`). It renders the page if that domain is connected, `active` and
  published; anything else gets the neutral 404. The response varies on the domain header.
  - On the domain, the canonical URL is `https://<domain>/`.
  - The quote form is the app's embeddable form from app.everdoer.com, because Turnstile only
    runs on our hostnames.
  - Connecting a domain adds it to the site's form key if that key only accepts listed websites.

## What the owner does

They type their domain and add **two records** at their DNS provider:

- **A CNAME** from `www` (or whatever subdomain they typed) to `sites.everdoer.com`. This routes
  the domain, and Cloudflare uses it to issue the certificate.
- **Our ownership TXT record:** `_everdoer-verify[.www]` = `everdoer-verify=<token>`. A CNAME
  alone isn't proof: a CNAME left behind after a business disconnects could otherwise let
  another business claim that domain. We check the TXT record over DNS-over-HTTPS until it's
  seen once, and the domain can't go live without it.

The root domain (`acmeroofing.ca`) only works where the provider supports a CNAME at the root
(Cloudflare, Namecheap and others). Settings recommends the www address. Owners usually point the
bare domain at www with their registrar's forwarding.

**Status.** Settings re-checks when an owner or admin opens it: a pending domain at most once a
minute, a live one every 6 hours. There's also a "Check now" button.

- **Going live:** the domain is live when ownership is proven, the hostname is `active` (or
  `active_redeploying`), and its certificate is `active`.
- **Renewals:** a domain that has been live stays live while its certificate renews (the
  `pending_*` states, while the old certificate keeps serving).
- **Not live yet:** each check sends Cloudflare a no-change PATCH, so validation re-runs right
  away instead of on Cloudflare's backoff of up to 4 hours. Cloudflare's own explanation, such as
  "does not CNAME to this zone", is shown.
- **Release:** a domain that has never been live is released after 7 days. One that has been live
  is never released automatically. If it turns `moved` because the owner's DNS broke, it shows as
  waiting until they fix it.
- **CAA records:** if the owner's domain has CAA records, they must allow Cloudflare's
  certificate authorities, or the certificate can't be issued.

**Disconnect** deletes the custom hostname. If Cloudflare fails, the domain is kept and the owner
is told to try again. One already gone is simply cleared.

## Setup (once)

1. **Turn on Cloudflare for SaaS:** Cloudflare dashboard → everdoer.com → SSL/TLS → Custom
   Hostnames → enable. It asks for a payment method. The first 100 hostnames are free, then
   $0.10 per hostname per month, up to 50,000.
2. **Create an API token** (My Profile → API Tokens → Create Custom Token) with these permissions:
   - Zone · DNS · Edit — everdoer.com
   - Zone · SSL and Certificates · Edit — everdoer.com
   - Zone · Workers Routes · Edit — everdoer.com
   - Account · Workers Scripts · Edit — the account
3. **Set on the Everdoer web service (Railway):**
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ZONE_ID` (everdoer.com: `78ecbbcc814058fae0af3d723b4d74d0`)
   - `CLOUDFLARE_ACCOUNT_ID` (`cf62125f9960927961c98938f1d6298e`)
   - `SITES_EDGE_KEY` (a random secret, 32+ characters)
   - optionally `SITES_CNAME_TARGET` (default `sites.everdoer.com`) and `SITE_DOMAINS_MAX`
     (default 1000)
4. **Run the setup job.** Do a dry run first, then apply:
   `railway run --service Everdoer -- npm run job:cloudflare-sites-setup [-- --apply]`
   (`src/server/jobs/cloudflare-sites-setup.ts`). It creates, if missing:
   - `sites-origin` (AAAA `100::`, proxied, because the Worker answers so there's no real origin)
     and `sites` (CNAME → `sites-origin`, proxied);
   - the fallback origin;
   - the Worker with its bindings (`ORIGIN`, `OWN_ZONE`, `EDGE_KEY`);
   - the `*/*` route.
   It is re-runnable, and stops without changing anything if a name or the route is already used
   by something else. Re-run it after changing `worker.js` or `SITES_EDGE_KEY`.

## Code

- `src/server/services/dfy/site-domain.ts` — connect, check, remove (Cloudflare API).
  `readHostname` and `recordName` are pure.
- `src/server/services/dfy/site-host.ts` → `edgeSiteHost`.
- `src/server/services/dfy/site-public.ts` → `loadPublishedSiteForDomain` and `sitePublicUrl`.
- `src/components/settings/WebsiteBranding.tsx` → `SiteDomainCard`.
- Tests: `site-branding-domain.test.ts` and `cloudflare-sites-edge.test.ts`.
