/**
 * What a new business's AI still needs to work fully (src/server/services/onboarding-ai.ts
 * loadAiReadiness), as plain to-dos that each point at the wizard step that fixes them. Pure —
 * shared by the onboarding "Your AI" step and its tests.
 */
export interface AiReadiness {
  /** The owner's cell is confirmed — approvals by text ("Y 12") and owner texts work. */
  ownerCellConfirmed: boolean;
  /** The company has its own number (customers text it; missed calls forward to it). */
  hasNumber: boolean;
  /** Active services with a price the AI can quote. */
  pricedServices: number;
  /** Active services still at $0 (the AI won't quote those). */
  unpricedServices: number;
}

export type ReadinessItem = { key: "cell" | "number" | "prices"; text: string; step: "business" | "phone" | "services" };

/** What's still missing, in the order to fix it. */
export function readinessGaps(r: AiReadiness): ReadinessItem[] {
  const gaps: ReadinessItem[] = [];
  if (!r.hasNumber) gaps.push({ key: "number", text: "Get your number — customers text it and your missed calls forward to it.", step: "phone" });
  if (!r.ownerCellConfirmed) gaps.push({ key: "cell", text: "Confirm your cell — that's where your AI asks for your OK.", step: "business" });
  if (r.pricedServices === 0) {
    gaps.push({ key: "prices", text: "Add prices to your services — until then it takes the details and you send the quote.", step: "services" });
  } else if (r.unpricedServices > 0) {
    const one = r.unpricedServices === 1;
    gaps.push({ key: "prices", text: `${r.unpricedServices} service${one ? " has" : "s have"} no price yet — it won't quote ${one ? "that one" : "those"}.`, step: "services" });
  }
  return gaps;
}
