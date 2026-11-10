/**
 * The onboarding wizard's steps, for the client (the server's list is
 * src/server/services/onboarding.ts ONBOARDING_STEPS; a test keeps the two the same).
 *
 * The server stores nine steps; the owner sees them in two groups. ESSENTIALS are the four things
 * the AI can't work without. EXTRAS are worth doing and never block anything, so they are offered
 * "when you're ready" and never counted as unfinished setup. `test_call` is a check, not a task:
 * with one number (missed-call catcher) the Phone step already holds the forwarding test, so it
 * is only its own step on a dedicated AI line.
 */
export const ONBOARDING_STEP_KEYS = ["business", "services", "phone", "ai", "payments", "website", "test_call", "team", "recipes"] as const;
export const ONBOARDING_STEP_COUNT = ONBOARDING_STEP_KEYS.length;

export type OnboardingStepKey = (typeof ONBOARDING_STEP_KEYS)[number];

export const ESSENTIAL_STEP_KEYS = ["business", "services", "phone", "ai"] as const satisfies readonly OnboardingStepKey[];
export const EXTRA_STEP_KEYS = ["payments", "website", "team", "recipes"] as const satisfies readonly OnboardingStepKey[];

/** What an extra gets the owner, in their words (Home's "when you're ready" list). */
export const EXTRA_STEP_LABEL: Record<(typeof EXTRA_STEP_KEYS)[number], string> = {
  payments: "Take card payments",
  website: "Get leads from your website",
  team: "Invite your team",
  recipes: "Review your automations",
};

export interface StepState {
  step: string;
  status: string;
  data?: Record<string, unknown> | null;
}

const MISSED_CALL_CATCHER = "missed_call_catcher";

/** The phone step's mode, once it has one. PURE. */
export function phoneModeOf(steps: readonly StepState[]): string | null {
  const mode = steps.find((s) => s.step === "phone")?.data?.mode;
  return typeof mode === "string" ? mode : null;
}

/**
 * Whether "Test call" is its own step: only on a dedicated AI line. With one number the Phone
 * step runs the forwarding test itself, and until a mode is chosen there is nothing to call. PURE.
 */
export function showsTestCallStep(phoneMode: string | null): boolean {
  return phoneMode !== null && phoneMode !== MISSED_CALL_CATCHER;
}

/** The wizard's steps for this business, in order, in their two groups. PURE. */
export function wizardGroups(phoneMode: string | null): { essentials: OnboardingStepKey[]; extras: OnboardingStepKey[] } {
  return {
    essentials: [...ESSENTIAL_STEP_KEYS, ...(showsTestCallStep(phoneMode) ? (["test_call"] as const) : [])],
    extras: [...EXTRA_STEP_KEYS],
  };
}

/** Where a requested / resumed step actually lives: a hidden "Test call" is the Phone step. PURE. */
export function resolveWizardStep(step: string | null | undefined, phoneMode: string | null): OnboardingStepKey | null {
  if (!step || !(ONBOARDING_STEP_KEYS as readonly string[]).includes(step)) return null;
  if (step === "test_call" && !showsTestCallStep(phoneMode)) return "phone";
  return step as OnboardingStepKey;
}

/** "Skip for now" is recorded as complete (so the wizard moves on) with `skipped` in its data. PURE. */
export function isStepSkipped(state: StepState | undefined): boolean {
  return state?.status === "complete" && state.data?.skipped === true;
}

/** Actually done — not skipped. PURE. */
export function isStepDone(state: StepState | undefined): boolean {
  return state?.status === "complete" && !isStepSkipped(state);
}

export interface SetupSummary {
  essentials: Array<{ step: OnboardingStepKey; done: boolean }>;
  essentialsDone: boolean;
  /** The first essential still to do (null once they're all done). */
  nextEssential: OnboardingStepKey | null;
  /** Extras never done (skipped counts as not done — they said "later", not "no"). */
  extrasLeft: Array<(typeof EXTRA_STEP_KEYS)[number]>;
}

/** What setup looks like to the owner: the essentials and what's left of the extras. PURE. */
export function setupSummary(steps: readonly StepState[]): SetupSummary {
  const byStep = new Map(steps.map((s) => [s.step, s]));
  const { essentials: essentialKeys } = wizardGroups(phoneModeOf(steps));
  const essentials = essentialKeys.map((step) => ({ step, done: isStepDone(byStep.get(step)) }));
  return {
    essentials,
    essentialsDone: essentials.every((e) => e.done),
    nextEssential: essentials.find((e) => !e.done)?.step ?? null,
    extrasLeft: EXTRA_STEP_KEYS.filter((step) => !isStepDone(byStep.get(step))),
  };
}
