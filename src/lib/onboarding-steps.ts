/**
 * The onboarding wizard's steps, for the client (the server's list is
 * src/server/services/onboarding.ts ONBOARDING_STEPS; a test keeps the two the same).
 */
export const ONBOARDING_STEP_KEYS = ["business", "services", "phone", "ai", "payments", "website", "test_call", "team", "recipes"] as const;
export const ONBOARDING_STEP_COUNT = ONBOARDING_STEP_KEYS.length;
