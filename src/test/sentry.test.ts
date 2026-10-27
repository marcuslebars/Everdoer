import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({
  init: vi.fn(),
  captureException: vi.fn(),
  flush: vi.fn(async () => true),
  withScope: vi.fn((fn: (scope: { setTag: (k: string, v: string) => void; setExtras: (e: Record<string, unknown>) => void }) => void) => fn(scope)),
}));
const scope = vi.hoisted(() => ({ setTag: vi.fn(), setExtras: vi.fn() }));
vi.mock("@sentry/node", () => sentry);

async function fresh() {
  vi.resetModules();
  return import("@/server/observability/sentry");
}

beforeEach(() => {
  for (const fn of [sentry.init, sentry.captureException, sentry.flush, sentry.withScope, scope.setTag, scope.setExtras]) fn.mockClear();
});
afterEach(() => vi.unstubAllEnvs());

describe("server Sentry", () => {
  it("off without SENTRY_DSN: init is a no-op and nothing is captured", async () => {
    const m = await fresh();
    expect(m.sentryConfig({})).toBeNull();
    expect(m.initServerSentry("web", {})).toBe(false);
    m.captureServerError(new Error("boom"), { where: "api" });
    await m.flushSentry();
    expect(sentry.init).not.toHaveBeenCalled();
    expect(sentry.captureException).not.toHaveBeenCalled();
    expect(sentry.flush).not.toHaveBeenCalled();
  });

  it("config: environment / release from Railway, tracing off unless asked, capped at 1", async () => {
    const m = await fresh();
    expect(m.sentryConfig({ SENTRY_DSN: " https://k@o.ingest/1 ", RAILWAY_ENVIRONMENT_NAME: "production", RAILWAY_GIT_COMMIT_SHA: "abc" })).toEqual({
      dsn: "https://k@o.ingest/1",
      environment: "production",
      release: "abc",
      tracesSampleRate: 0,
    });
    expect(m.sentryConfig({ SENTRY_DSN: "x", SENTRY_ENVIRONMENT: "staging", SENTRY_TRACES_SAMPLE_RATE: "5" })).toMatchObject({ environment: "staging", tracesSampleRate: 1 });
  });

  it("on: one init (idempotent), no default PII, errors captured with where + errorId tags", async () => {
    const m = await fresh();
    expect(m.initServerSentry("workflow-worker", { SENTRY_DSN: "https://k@o.ingest/1" })).toBe(true);
    expect(m.initServerSentry("workflow-worker", { SENTRY_DSN: "https://k@o.ingest/1" })).toBe(true);
    expect(sentry.init).toHaveBeenCalledTimes(1);
    expect(sentry.init.mock.calls[0][0]).toMatchObject({
      dsn: "https://k@o.ingest/1",
      dataCollection: { userInfo: false, cookies: false, httpBodies: [], urlQueryParams: false, databaseQueryData: false, stackFrameVariables: false },
      initialScope: { tags: { service: "workflow-worker" } },
    });
    const err = new Error("db down");
    m.captureServerError(err, { where: "GET /api/x", errorId: "ab12cd34", extra: { jobId: "j1" } });
    expect(sentry.captureException).toHaveBeenCalledWith(err);
    expect(scope.setTag).toHaveBeenCalledWith("where", "GET /api/x");
    expect(scope.setTag).toHaveBeenCalledWith("error_id", "ab12cd34");
    expect(scope.setExtras).toHaveBeenCalledWith({ jobId: "j1" });
  });

  it("scrubs cookies, bodies, auth / signature headers and query strings", async () => {
    const m = await fresh();
    const event = m.scrubEvent({
      type: undefined,
      request: {
        url: "https://app.test/api/x?token=secret",
        query_string: "token=secret",
        cookies: { sb: "jwt" },
        data: { phone: "+1555" },
        headers: { authorization: "Bearer x", cookie: "sb=jwt", "stripe-signature": "t=1", "x-twilio-signature": "s", "user-agent": "ua" },
      },
    });
    expect(event.request).toEqual({ url: "https://app.test/api/x", headers: { "user-agent": "ua" } });
  });
});

describe("handleRoute reports only unexpected errors", () => {
  it("a 500 is captured with its errorId; a user-facing error is not", async () => {
    vi.resetModules();
    const capture = vi.fn();
    vi.doMock("@/server/observability/sentry", () => ({ captureServerError: capture }));
    const { errorResponse } = await import("@/server/api/route");
    const { ValidationError } = await import("@/server/organizations/context");
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = errorResponse(new Error("boom"), "GET /api/thing");
    const body = (await res.json()) as { errorId: string };
    expect(res.status).toBe(500);
    expect(capture).toHaveBeenCalledWith(expect.any(Error), { where: "GET /api/thing", errorId: body.errorId });
    capture.mockClear();
    expect(errorResponse(new ValidationError("Name is required.")).status).toBe(400);
    expect(capture).not.toHaveBeenCalled();
    spy.mockRestore();
    vi.doUnmock("@/server/observability/sentry");
  });
});
