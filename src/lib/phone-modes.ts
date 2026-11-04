/** How the onboarding Phone step can handle calls. */
export type PhoneMode = "ai_receptionist" | "missed_call_catcher";

/**
 * Done-for-you Catch / Close bought the missed-call catcher only (the AI receptionist is
 * Front Desk). Shared by the wizard UI and the server-side gate on
 * /api/organizations/[id]/onboarding/phone. Pure, no imports (used by both bundles).
 */
export function isCatcherOnlyTier(planTier: string | null | undefined): boolean {
  return planTier === "catch" || planTier === "close";
}

/**
 * Which phone modes the Phone step offers. Only a done-for-you Catch/Close org without
 * marina_reception is limited to the catcher; every other org (self-serve trials, existing
 * operate/launch orgs, Front Desk, house) sees both, exactly as before. The server enforces
 * the same rule — this only shapes the UI.
 */
export function availablePhoneModes(input: {
  planTier: string | null | undefined;
  aiReceptionistAllowed: boolean;
}): PhoneMode[] {
  return isCatcherOnlyTier(input.planTier) && !input.aiReceptionistAllowed
    ? ["missed_call_catcher"]
    : ["ai_receptionist", "missed_call_catcher"];
}

/** The Phone step's one line on who picks up a forwarded call (onboarding-number.ts AnsweringLevel). */
export function answeringCopy(level: "receptionist" | "message" | "voicemail", receptionistIncluded: boolean): string {
  if (level === "receptionist") return "Your AI receptionist answers: it quotes from your price list, books the job, and texts you a summary.";
  if (level === "voicemail") return "AI answering is off: callers hear your greeting, can leave a voicemail, and get a text from you. Turn the AI on any time in Your AI.";
  return receptionistIncluded
    ? "Your AI answers, takes a message, and the caller gets a text right away. (Your quoting receptionist is being set up — try again in a minute if this doesn't change.)"
    : "Your AI answers, takes a message, and the caller gets a text right away. On Front Desk it also quotes and books.";
}
