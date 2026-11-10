/**
 * Home's setup card for a self-serve business: what it should say right now. It never reports a
 * count of wizard steps — a skipped step isn't progress, and "6 of 9 done" hid the one thing that
 * mattered (calls not reaching the AI). In order:
 *   1. essentials still to do            → "Finish setting up", with the next one named;
 *   2. essentials done, AI has a gap     → the gap itself, with the link that fixes it;
 *   3. all working, extras never done    → a quiet "when you're ready" list the owner can hide;
 *   4. otherwise                         → nothing.
 * Once every stored step is complete the card is gone for good and AiReadinessCard reports gaps.
 * PURE — rendered by OnboardingChecklistCard (src/screens/Dashboard.tsx), tested in
 * src/test/setup-card.test.tsx.
 */
import { readinessGaps, type AiReadiness, type ReadinessItem } from "@/lib/ai-readiness";
import { EXTRA_STEP_KEYS, EXTRA_STEP_LABEL, ONBOARDING_STEP_KEYS, setupSummary, type OnboardingStepKey, type StepState } from "@/lib/onboarding-steps";

/** The next essential, as something to do. */
export const ESSENTIAL_ACTION: Partial<Record<OnboardingStepKey, string>> = {
  business: "tell us about your business",
  services: "add your services and prices",
  phone: "get your number",
  ai: "turn on your AI",
  test_call: "make a test call",
};

export type SetupCardView =
  | { kind: "essentials"; done: number; total: number; nextStep: OnboardingStepKey; nextAction: string }
  | { kind: "gaps"; gaps: ReadinessItem[] }
  | { kind: "extras"; extras: Array<{ step: (typeof EXTRA_STEP_KEYS)[number]; label: string }> }
  | null;

export function setupCardView(input: {
  /** null: they named the account but never saved the Business step. */
  steps: readonly StepState[] | null;
  /** What the AI still needs (null while loading, or when it couldn't be read). */
  readiness: AiReadiness | null;
  /** Owners and admins can fix a gap; members aren't shown one. */
  canFix: boolean;
  /** The owner tapped "Hide" on the extras list (this device). */
  extrasHidden: boolean;
}): SetupCardView {
  const steps = input.steps ?? [];
  if (input.steps && ONBOARDING_STEP_KEYS.every((key) => steps.some((s) => s.step === key && s.status === "complete"))) return null;

  const summary = setupSummary(steps);
  if (!summary.essentialsDone && summary.nextEssential) {
    return {
      kind: "essentials",
      done: summary.essentials.filter((e) => e.done).length,
      total: summary.essentials.length,
      nextStep: summary.nextEssential,
      nextAction: ESSENTIAL_ACTION[summary.nextEssential] ?? "finish setup",
    };
  }
  const gaps = input.readiness && input.canFix ? readinessGaps(input.readiness) : [];
  if (gaps.length > 0) return { kind: "gaps", gaps };
  if (summary.extrasLeft.length > 0 && !input.extrasHidden) {
    return { kind: "extras", extras: summary.extrasLeft.map((step) => ({ step, label: EXTRA_STEP_LABEL[step] })) };
  }
  return null;
}

const HIDDEN_PREFIX = "everdoer_setup_extras_hidden:";

/** Whether the owner hid the "when you're ready" list for this account on this device. Never throws. */
export function readExtrasHidden(orgId: string): boolean {
  try {
    return window.localStorage.getItem(`${HIDDEN_PREFIX}${orgId}`) === "1";
  } catch {
    return false;
  }
}

export function hideExtras(orgId: string): void {
  try {
    window.localStorage.setItem(`${HIDDEN_PREFIX}${orgId}`, "1");
  } catch {
    // Private window / blocked storage: hidden for this visit only.
  }
}
