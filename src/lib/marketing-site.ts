/**
 * The public marketing site (everdoer.com). New businesses start there: they pick a plan, add a
 * card for the free trial, and the account is created for them (done-for-you checkout). The app's
 * own /signup is only for people joining an existing account from an invite.
 */
const MARKETING_ORIGIN = (
  (import.meta.env.VITE_MARKETING_URL as string | undefined) || "https://everdoer.com"
).replace(/\/+$/, "");

/** Plans and checkout. */
export const PLANS_URL = `${MARKETING_ORIGIN}/#pricing`;
