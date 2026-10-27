/**
 * Next.js instrumentation hook (next.config.mjs → experimental.instrumentationHook): runs once
 * when the server starts. Starts error reporting for the web service when SENTRY_DSN is set
 * (src/server/observability/sentry.ts); a no-op otherwise. The NEXT_RUNTIME check is the
 * documented pattern that keeps the Node-only SDK out of the edge bundle.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initServerSentry } = await import("@/server/observability/sentry");
    initServerSentry("web");
  }
}
