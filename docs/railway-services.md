# Railway services

Every Everdoer service deploys from this repo (`marcuslebars/Everdoer`, branch `main`, builder
Railpack). Their build and run settings live **on each service in Railway** (Service →
Settings), not in files: Railway's Config as Code (`railway.json` / `railway.*.json`) stops
working on 2026-12-01, so those files were removed on 2026-11-03 after their settings were
copied onto the services. This table is the reference; keep it in step with Railway.

| Service | Start command | Build command | Restart | Cron (UTC) | Health check |
| --- | --- | --- | --- | --- | --- |
| `Everdoer` (web: app, API, public pages) | `npm run start` | `npm run build` | on failure | none | `/api/health` |
| `workflow-events` (workflow + inbound-webhook worker, scheduler) | `npm run worker:workflow-events` | `npm run build` | on failure | none | none |
| `billiing-worker` (Stripe/billing events, done-for-you provisioning) | `npm run worker:billing-events` | `npm run build` | on failure | none | none |
| `billing-reconcile` | `npm run job:billing-reconcile` | `npm run build` | never | `0 8 * * *` | none |
| `quote-maintenance` | `npm run job:quote-maintenance` | `npm run build` | never | `0 13 * * *` | none |
| `monthly-scorecard` | `npm run job:monthly-scorecard` | `npm run build` | never | `0 13 1 * *` | none |
| `crankleads-sweep` (done-for-you safety net) | `npm run job:dfy-provision -- --stuck` | `npm run build` | never | `*/15 * * * *` | none |
| `voice-overage` (**not created yet**, see [billing.md](billing.md#voice-overage)) | `npm run job:voice-overage -- --run` | `npm run build` | never | `0 12 * * *` | none |

**Always set both the build and the start command.** With no start command, Railpack detects a
static Vite app and serves `dist/` through Caddy: every `/api/*` route then returns the SPA's
`index.html` and the API is silently dead (see the runbook, "Builder & run"). Cron services
also need restart policy "never".

To add a service: Railway → New service → this repo → set the row's values in Settings, then
its environment variables (each doc's setup section lists them).

Railway's replacement for Config as Code is Infrastructure as Code (`.railway/railway.ts`,
`railway config pull` / `plan` / `apply`). We don't use it yet; until we do, the service
settings above are the source of truth.
