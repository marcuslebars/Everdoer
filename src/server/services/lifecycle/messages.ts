/**
 * PURE: the lifecycle emails (from "Marcus at Everdoer") and the operator's texts.
 * docs/lifecycle-emails.md. Plain words, short, one ask per email. No dollar amounts are written
 * here: the trial-ending price comes from Stripe at send time (Working Protocol #4).
 */
import type { LifecycleCustomerKey, LifecycleOperatorKey } from "./rules";

export const LIFECYCLE_FROM_NAME = "Marcus at Everdoer";

export interface RenderedLifecycleEmail {
  subject: string;
  body: string;
  html: string;
}

/** What the AI did for them since they started (scorecard metrics, purchase → now). */
export interface LifecycleResults {
  missedCallsCaught: number;
  callsAnswered: number;
  textsSent: number;
  leads: number;
  jobsBooked: number;
}

export interface LifecycleEmailInput {
  ownerName: string | null;
  businessName: string;
  appUrl: string;
  timeZone: string;
  results: LifecycleResults | null;
  /** trial_ending: when the first charge happens. */
  trialEndsAtMs?: number | null;
  /** trial_ending: the first invoice's total from Stripe ("CA$338.87"), tax and any setup fee included. */
  firstCharge?: string | null;
  /** trial_ending: the plan's monthly price from Stripe ("CA$299.00"), before tax. */
  monthlyPrice?: string | null;
  /** trial_ending: Stripe Tax is on, so the monthly price is "plus tax". */
  taxed?: boolean;
}

function firstName(name: string | null): string {
  const first = (name ?? "").trim().split(/\s+/)[0];
  return first || "there";
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function formatDay(ms: number, timeZone: string): string {
  const opts: Intl.DateTimeFormatOptions = { weekday: "long", month: "long", day: "numeric" };
  try {
    return new Intl.DateTimeFormat("en-CA", { ...opts, timeZone }).format(new Date(ms));
  } catch {
    return new Intl.DateTimeFormat("en-CA", { ...opts, timeZone: "America/Toronto" }).format(new Date(ms));
  }
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** The results as bullet lines, biggest wins first; [] when nothing has happened yet. */
export function resultLines(r: LifecycleResults | null): string[] {
  if (!r) return [];
  const lines: string[] = [];
  if (r.missedCallsCaught > 0) lines.push(`${plural(r.missedCallsCaught, "missed call", "missed calls")} caught and followed up`);
  if (r.callsAnswered > 0) lines.push(`${plural(r.callsAnswered, "call", "calls")} answered by your AI`);
  if (r.textsSent > 0) lines.push(`${plural(r.textsSent, "text", "texts")} sent to customers for you`);
  if (r.leads > 0) lines.push(`${plural(r.leads, "new lead", "new leads")}`);
  if (r.jobsBooked > 0) lines.push(`${plural(r.jobsBooked, "job", "jobs")} booked`);
  return lines;
}

/** CASL: who is sending, a mailing address, and a way to opt out (docs/lifecycle-emails.md). */
export const LIFECYCLE_FOOTER =
  'Everdoer Technologies Inc., 2967 Dundas St. W. #671, Toronto, ON M6P 1Z2. You get these emails because you have an Everdoer account. Don\'t want them? Reply "stop".';

const SIGNOFF_TEXT = ["", "Marcus", "Founder, Everdoer", "", "--", LIFECYCLE_FOOTER];
const SIGNOFF_HTML = `<p>Marcus<br>Founder, Everdoer</p>\n<p style="font-size:12px;color:#6b7280">${LIFECYCLE_FOOTER.replace(/'/g, "&#39;").replace(/"/g, "&quot;")}</p>`;

function assemble(subject: string, paragraphs: Array<string | string[]>): RenderedLifecycleEmail {
  // A string is a paragraph; a string[] is a bullet list.
  const body = [
    ...paragraphs.flatMap((p) => (Array.isArray(p) ? [...p.map((line) => `  • ${line}`), ""] : [p, ""])),
    ...SIGNOFF_TEXT.slice(1),
  ].join("\n");
  const html = [
    ...paragraphs.map((p) =>
      Array.isArray(p) ? `<ul>${p.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>` : `<p>${linkify(escapeHtml(p))}</p>`,
    ),
    SIGNOFF_HTML,
  ].join("\n");
  return { subject, body, html };
}

/** Bare https URLs in already-escaped text become links. */
function linkify(escaped: string): string {
  return escaped.replace(/https:\/\/[^\s<]+[^\s<.,)]/g, (url) => `<a href="${url}">${url}</a>`);
}

export function renderLifecycleEmail(key: LifecycleCustomerKey, input: LifecycleEmailInput): RenderedLifecycleEmail {
  const hi = `Hi ${firstName(input.ownerName)},`;
  const lines = resultLines(input.results);
  switch (key) {
    case "trial_results":
      return assemble(
        `${input.businessName}'s first days with Everdoer`,
        lines.length
          ? [hi, `Quick check-in. Here's what Everdoer has done for ${input.businessName} so far:`, lines, "Is there anything you'd change about how it talks to your customers? Just reply and tell me. I read every one."]
          : [
              hi,
              `Quick check-in. It's been quiet at ${input.businessName} so far, which is normal in the first week.`,
              "Want to see it work? Call your business number from another phone and let it ring out. You'll get exactly what your customers get.",
              "Anything you'd change, or anything not working the way you expected? Just reply. I read every one.",
            ],
      );
    case "trial_ending": {
      const day = input.trialEndsAtMs ? formatDay(input.trialEndsAtMs, input.timeZone) : null;
      const monthly = input.monthlyPrice
        ? `${input.monthlyPrice}${input.taxed ? " plus tax" : ""} a month`
        : `your plan's monthly price${input.taxed ? " plus tax" : ""}`;
      const when = day ? `On ${day}` : "When the trial ends";
      const chargeSentence = input.firstCharge
        ? `${when} your card is charged ${input.firstCharge}${input.taxed ? " (tax included)" : ""} for your first month, then ${monthly} after that.`
        : `${when} your card is charged for your first month, then ${monthly} after that.`;
      return assemble(
        day ? `Your Everdoer trial ends ${day}` : "Your Everdoer trial ends soon",
        [
          hi,
          `Your free trial for ${input.businessName} ends ${day ?? "in a few days"}.`,
          ...(lines.length ? ["So far, Everdoer has:", lines] : []),
          `To keep going you don't need to do anything. ${chargeSentence} It's month-to-month, so you can cancel any time.`,
          `To change your plan or cancel, go to Billing: ${input.appUrl}/settings/billing`,
          "If it hasn't been the right fit, or something isn't working, reply and tell me. I'd rather fix it than lose you.",
        ],
      );
    }
    case "paid_welcome":
      return assemble(`Welcome aboard, ${firstName(input.ownerName)}`, [
        hi,
        `Thanks for sticking with Everdoer past the trial. ${input.businessName} is all set.`,
        `One thing most owners miss: open Your AI and check the prices and services it answers from. The more accurate they are, the more jobs it books without you: ${input.appUrl}/ai`,
        "You'll get a short report every Monday morning, and a scorecard on the 1st of each month, so you can see what it's catching.",
        "If anything ever needs changing, just reply here. It comes straight to me.",
      ]);
    case "cancelled":
      return assemble("Sorry to see you go", [
        hi,
        `Your Everdoer account for ${input.businessName} is cancelled, so missed calls won't be answered or texted back anymore.`,
        "Please turn off call forwarding on your business phone so calls ring straight through again. On most phones you do that by dialling ##004#. If you're not sure, reply and I'll walk you through it.",
        "One question, if you have a second: what didn't work for you? Just hit reply. Even one line helps me make it better.",
      ]);
  }
}

export interface OperatorTextInput {
  businessName: string;
  /** "Close", "Catch"…, or null for an app sign-up. */
  tierLabel: string | null;
  ownerName: string | null;
  ownerPhone: string | null;
  ownerEmail: string | null;
}

export function renderOperatorText(key: LifecycleOperatorKey, input: OperatorTextInput): string {
  const who = [input.ownerName, input.ownerPhone ?? input.ownerEmail].filter(Boolean).join(", ");
  switch (key) {
    case "op_signup":
      return input.tierLabel
        ? `Everdoer: new signup! ${input.businessName} started a ${input.tierLabel} trial.${who ? ` ${who}.` : ""}`
        : `Everdoer: new app sign-up: ${input.businessName}.${who ? ` ${who}.` : ""}`;
    case "op_live":
      return `Everdoer: ${input.businessName} is live. Their missed calls are now being caught.`;
    case "op_converted":
      return `Everdoer: ${input.businessName} converted from trial to paid${input.tierLabel ? ` (${input.tierLabel})` : ""}.`;
    case "op_cancelled":
      return `Everdoer: ${input.businessName} cancelled.${who ? ` ${who}.` : ""}`;
  }
}
