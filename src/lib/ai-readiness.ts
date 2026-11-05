/**
 * What a business's AI still needs to work fully (src/server/services/onboarding-ai.ts
 * loadAiReadiness), as plain to-dos. Each points at where it's fixed: `step` (the onboarding
 * wizard's step, for the wizard) and `href` (a page, for the "Your AI" card on Today and Your AI).
 * Pure — shared by the UI and its tests.
 */
export interface AiReadiness {
  /** The owner's cell is confirmed — approvals by text ("Y 12") and owner texts work. */
  ownerCellConfirmed: boolean;
  /** The company has its own number (customers text it; missed calls forward to it). */
  hasNumber: boolean;
  /** The business line's forwarding to that number has been tested and works. */
  forwardingVerified: boolean;
  /** "Answer customer texts" is on. */
  textsOn: boolean;
  /** "Answer your phone" is on (AI, not voicemail). */
  callsOn: boolean;
  /** Active services with a price the AI can quote. */
  pricedServices: number;
  /** Active services still at $0 (the AI won't quote those). */
  unpricedServices: number;
}

export type ReadinessKey = "number" | "forwarding" | "cell" | "texts" | "calls" | "prices";

export type ReadinessItem = {
  key: ReadinessKey;
  text: string;
  step: "business" | "services" | "phone" | "ai";
  href: string;
};

/** What's still missing, in the order to fix it. */
export function readinessGaps(r: AiReadiness): ReadinessItem[] {
  const gaps: ReadinessItem[] = [];
  if (!r.hasNumber) {
    gaps.push({ key: "number", text: "Get your number — customers text it and your missed calls forward to it.", step: "phone", href: "/onboarding?step=phone" });
  } else if (!r.forwardingVerified) {
    gaps.push({ key: "forwarding", text: "Turn on call forwarding and test it — until then, missed calls don't reach your AI.", step: "phone", href: "/onboarding?step=phone" });
  }
  if (!r.ownerCellConfirmed) {
    gaps.push({ key: "cell", text: "Confirm your cell — that's where your AI asks for your OK.", step: "business", href: "/settings?section=front-desk&focus=owner-phone" });
  }
  if (!r.textsOn) gaps.push({ key: "texts", text: "Your AI isn't answering customer texts yet.", step: "ai", href: "/ai" });
  if (!r.callsOn) gaps.push({ key: "calls", text: "Missed calls go to voicemail — your AI could pick them up.", step: "ai", href: "/ai" });
  if (r.pricedServices === 0) {
    gaps.push({ key: "prices", text: "Add prices to your services — until then it takes the details and you send the quote.", step: "services", href: "/settings?section=packs" });
  } else if (r.unpricedServices > 0) {
    const one = r.unpricedServices === 1;
    gaps.push({ key: "prices", text: `${r.unpricedServices} service${one ? " has" : "s have"} no price yet — it won't quote ${one ? "that one" : "those"}.`, step: "services", href: "/settings?section=packs" });
  }
  return gaps;
}
