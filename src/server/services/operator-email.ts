/**
 * Where Everdoer's own alerts go.
 *
 * "Everdoer's own" means the product, not a business that runs on it: an enquiry from
 * everdoer.com, a new purchase, a setup that failed or is stuck, a support request, the daily
 * health email. They go to EVERDOER_OPERATOR_EMAIL, and to OWNER_EMAIL when that isn't set, which
 * is where everything went before 16 Nov 2026.
 *
 * OWNER_EMAIL on its own stays the HOUSE businesses' inbox (A1): it is what a house company's
 * owner notifications fall back to (workflow-engine/messaging.ts resolveOwnerContacts), and with
 * LEAD_NOTIFY_EMAIL it is where the house businesses' new-lead alerts go (lead-intake/notify.ts).
 * The two were one address until an A1 inbox was blocked by the mail provider and took every
 * Everdoer alert down with it; they are separate so one business's inbox can't do that again.
 */
export function platformOperatorEmail(env: Record<string, string | undefined> = process.env): string | null {
  return env.EVERDOER_OPERATOR_EMAIL?.trim() || env.OWNER_EMAIL?.trim() || null;
}
