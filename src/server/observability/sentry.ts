/**
 * Error reporting to Sentry (docs/EVERDOER_RUNBOOK.md → "Error reporting").
 *
 * Off unless SENTRY_DSN is set: every function here is then a no-op, so local dev, tests and
 * any service without the DSN behave exactly as before (errors still go to the logs).
 *
 *   initServerSentry("web" | "workflow-worker" | …)  once per process (Next instrumentation,
 *                                                    the workers)
 *   captureServerError(error, { where, errorId })    an unexpected error (handleRoute's 500s,
 *                                                    worker job failures)
 *
 * Privacy: DATA_COLLECTION turns off user info, request bodies, cookies, query params, AI
 * prompts, SQL values and stack locals, scrubEvent strips auth headers, and there's no performance
 * tracing unless SENTRY_TRACES_SAMPLE_RATE is set. The errorId handleRoute shows the user is
 * attached as a tag, so support can find the event from what the customer reads out.
 */
import * as Sentry from "@sentry/node";

type Env = Readonly<Record<string, string | undefined>>;

let initialized = false;

export interface SentryConfig {
  dsn: string;
  environment: string;
  release: string | undefined;
  tracesSampleRate: number;
}

/** The config from env, or null when SENTRY_DSN is unset. PURE. */
export function sentryConfig(env: Env = process.env): SentryConfig | null {
  const dsn = env.SENTRY_DSN?.trim();
  if (!dsn) return null;
  const rate = Number(env.SENTRY_TRACES_SAMPLE_RATE);
  return {
    dsn,
    environment: env.SENTRY_ENVIRONMENT?.trim() || env.RAILWAY_ENVIRONMENT_NAME?.trim() || env.NODE_ENV || "development",
    release: env.SENTRY_RELEASE?.trim() || env.RAILWAY_GIT_COMMIT_SHA?.trim() || undefined,
    tracesSampleRate: Number.isFinite(rate) && rate > 0 ? Math.min(1, rate) : 0,
  };
}

/** Strip what could carry customer data or credentials before an event leaves. PURE. */
export function scrubEvent<E extends Sentry.ErrorEvent>(event: E): E {
  if (event.request) {
    delete event.request.cookies;
    delete event.request.data;
    if (event.request.headers) {
      for (const key of Object.keys(event.request.headers)) {
        if (/^(authorization|cookie|x-api-key|x-.*-signature|stripe-signature)$/i.test(key)) delete event.request.headers[key];
      }
    }
    if (typeof event.request.url === "string") event.request.url = event.request.url.split("?")[0];
    delete event.request.query_string;
  }
  return event;
}

/**
 * What the SDK may collect (v11's replacement for sendDefaultPii): no user info, cookies, bodies,
 * query params, AI prompts, SQL values or local variables; only harmless request headers.
 */
export const DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: { request: { allow: ["user-agent", "content-type", "accept"] }, response: false },
  httpBodies: [],
  urlQueryParams: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
} satisfies NonNullable<Sentry.NodeOptions["dataCollection"]>;

/** Start Sentry for this process (idempotent). True when it is on. */
export function initServerSentry(service: string, env: Env = process.env): boolean {
  if (initialized) return true;
  const config = sentryConfig(env);
  if (!config) return false;
  Sentry.init({
    dsn: config.dsn,
    environment: config.environment,
    release: config.release,
    tracesSampleRate: config.tracesSampleRate,
    dataCollection: DATA_COLLECTION,
    initialScope: { tags: { service } },
    beforeSend: (event) => scrubEvent(event),
  });
  initialized = true;
  return true;
}

export function sentryEnabled(): boolean {
  return initialized;
}

/** Report an unexpected error (no-op when Sentry is off). Never throws. */
export function captureServerError(error: unknown, context: { where: string; errorId?: string; extra?: Record<string, unknown> }): void {
  if (!initialized) return;
  try {
    Sentry.withScope((scope) => {
      scope.setTag("where", context.where);
      if (context.errorId) scope.setTag("error_id", context.errorId);
      if (context.extra) scope.setExtras(context.extra);
      Sentry.captureException(error);
    });
  } catch {
    // Reporting must never break the request or the worker.
  }
}

/** Flush before a short-lived process exits (jobs, a crashing worker). */
export async function flushSentry(timeoutMs = 2000): Promise<void> {
  if (!initialized) return;
  await Sentry.flush(timeoutMs).catch(() => undefined);
}
