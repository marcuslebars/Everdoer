/**
 * Browser error reporting (docs/EVERDOER_RUNBOOK.md → "Error reporting"). Off unless
 * VITE_SENTRY_DSN is set at build time; then @sentry/react is loaded as its own chunk, so the app
 * bundle doesn't grow when it's off. No session replay; no user info, cookies, headers, bodies or
 * query strings collected.
 */
export function initClientSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN?.trim();
  if (!dsn) return;
  void import("@sentry/react")
    .then((Sentry) => {
      Sentry.init({
        dsn,
        environment: import.meta.env.VITE_SENTRY_ENVIRONMENT?.trim() || import.meta.env.MODE,
        release: import.meta.env.VITE_SENTRY_RELEASE?.trim() || undefined,
        dataCollection: { userInfo: false, cookies: false, httpBodies: [], urlQueryParams: false, httpHeaders: false },
        tracesSampleRate: 0,
        initialScope: { tags: { service: "spa" } },
        beforeSend(event) {
          if (event.request?.url) event.request.url = event.request.url.split("?")[0];
          if (event.request) delete event.request.query_string;
          return event;
        },
      });
    })
    .catch(() => undefined);
}
