/**
 * find_services — "do you do X?", "what would you recommend for Y?": the company's own price
 * list, matched to what the customer described. Returns the best matches with their price
 * wording (the same text the price list states — never a made-up price), or, when nothing
 * matches, everything offered so the agent can say what the closest service is.
 */
import { loadBusinessFacts, type PriceListItem } from "@/server/services/sms-agent/facts";

import { str, type Skill, type SkillContext } from "./types";

const STOP = new Set(["the", "and", "for", "with", "you", "your", "can", "need", "want", "get", "have", "has", "our", "my", "a", "an", "do", "does", "any", "some", "how", "much", "what", "who", "please", "would", "could", "like"]);

/** Lower-case word stems (drops plurals and filler words). PURE. */
export function terms(text: string): string[] {
  return [
    ...new Set(
      text
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length >= 3 && !STOP.has(w))
        .map((w) => (w.length > 4 && w.endsWith("es") ? w.slice(0, -2) : w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w)),
    ),
  ];
}

/** How well a price-list item matches the customer's words. PURE. */
export function matchScore(item: Pick<PriceListItem, "key" | "label" | "description">, wanted: string[]): number {
  if (wanted.length === 0) return 0;
  const label = terms(item.label);
  const key = terms(item.key.replace(/_/g, " "));
  const description = terms(item.description ?? "");
  let score = 0;
  for (const w of wanted) {
    if (label.some((t) => t === w || t.startsWith(w) || w.startsWith(t))) score += 3;
    else if (key.some((t) => t === w || t.startsWith(w))) score += 2;
    else if (description.some((t) => t === w || t.startsWith(w))) score += 1;
  }
  return score;
}

export interface ServiceMatch {
  service_key: string;
  name: string;
  price: string;
  details: string | null;
}

function toMatch(item: PriceListItem): ServiceMatch {
  return {
    service_key: item.key,
    name: item.label,
    price: item.priceText ? `${item.priceText} + HST` : "no set price — the team quotes it",
    details: item.description ? item.description.slice(0, 160) : null,
  };
}

/** The best matches, or null when nothing scores. PURE. */
export function bestServices(items: PriceListItem[], need: string, limit = 5): ServiceMatch[] | null {
  const wanted = terms(need);
  const scored = items
    .map((item) => ({ item, score: matchScore(item, wanted) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.length ? scored.slice(0, limit).map((s) => toMatch(s.item)) : null;
}

async function factsFor(ctx: SkillContext) {
  return ctx.facts ?? loadBusinessFacts(ctx.admin, ctx.scope.companyId);
}

export const findServices: Skill = {
  name: "find_services",
  description:
    "Find the services this business offers that fit what the customer described (\"do you do gutter cleaning?\", \"my furnace is making a noise, what do I need?\"). Returns the matching services from the price list with their listed price wording. Use it to recommend the right service; only state prices exactly as returned (before HST). To give a real quote, use the quote tool next.",
  parameters: {
    type: "object",
    properties: { need: { type: "string", description: "What the customer needs or described, in their words." } },
    required: ["need"],
  },
  channels: ["voice", "customer_sms"],
  voice: { timeoutMs: 8_000 },
  async run(ctx, input) {
    const need = str(input.need, 300);
    if (!need) return { ok: false, reason: "missing_need", say: "What do you need done? I'll find the right service." };
    const facts = await factsFor(ctx);
    if (facts.priceList.length === 0) {
      return { ok: true, matches: [], offered: [], say: "Let me take down what you need, and the team will follow up with the details." };
    }
    const matches = bestServices(facts.priceList, need);
    if (matches) return { ok: true, matches };
    // Nothing matched the words: hand back what IS offered so the agent can point to the closest.
    return { ok: true, matches: [], offered: facts.priceList.slice(0, 15).map((i) => i.label), note: "No direct match. Say what's closest from `offered`, or take a message for the team." };
  },
};
