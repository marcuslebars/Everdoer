/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Browser error reporting (src/lib/sentry.ts); unset = off. */
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_SENTRY_ENVIRONMENT?: string;
  readonly VITE_SENTRY_RELEASE?: string;
}
