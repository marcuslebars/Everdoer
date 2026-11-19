# Lifecycle emails and operator texts

What a new Everdoer customer hears from us after the welcome email, and what Marcus hears about
them. Code: `src/server/services/lifecycle/` (rules.ts is pure and golden-tested; messages.ts holds
the wording; service.ts is the worker pass). Runs in the worker's scheduler pass every 5 minutes.

## The whole sequence

Already built elsewhere (unchanged):

| When | What | Where |
|---|---|---|
| Purchase | Welcome email + quick-setup text; operator email "New Everdoer purchase" | `done-for-you/provision.ts` |
| Business days 1/3/5/10 until live | Setup reminders, email + text | `done-for-you/setup-followups.ts` |
| Goes live | "You're live" email + text | same |
| Mondays 08:00 | Weekly front-desk report | `weekly-report/` |
| 1st of the month | Monthly scorecard | `monthly-scorecard/` |

Added here (customer emails from **"Marcus at Everdoer"**, replies to `EVERDOER_OPERATOR_EMAIL`):

| Key | When | Says |
|---|---|---|
| `trial_results` | Trialing, live, ≥ 5 days since purchase, ≥ 3 days before the trial ends | What it has caught so far (scorecard metrics since go-live), or how to test it if it's been quiet; "reply and tell me" |
| `trial_ending` | Trialing, from 4 days to 6 hours before the trial ends | The end date, results so far, the first charge (Stripe invoice preview, tax and any setup fee included) and the monthly price after it, the Billing link to change or cancel |
| `paid_welcome` | Active again after a trial we sent `trial_ending` for | Thanks; check prices on Your AI; the Monday report and monthly scorecard |
| `cancelled` | Canceled in the last 14 days | Turn off call forwarding (##004# on most phones); "what didn't work?" |

At most one customer email per account per pass, 08:00–20:00 in the company's timezone. A later
stage supersedes an earlier one that no longer makes sense (no "results" email late, no "trial
ends soon" after it ended).

Operator texts to `EVERDOER_OPERATOR_PHONE`, from the platform number, 07:00–22:00 Toronto:

| Key | When |
|---|---|
| `op_signup` | Any new account, 2 minutes after it appears (so the purchase is linked): an everdoer.com trial names the plan and the owner's name + phone; an app sign-up names the account and its billing email |
| `op_live` | The purchase went live |
| `op_converted` | Same moment as `paid_welcome` |
| `op_cancelled` | Same moment as `cancelled` |

## Rules that keep it safe

- Only accounts created on or after **19 Nov 2026** (`LIFECYCLE_START_MS`), so switching this on
  never mails or texts about old accounts. Never `internal` (house) accounts.
- Customer emails go only to everdoer.com buyers (`crankleads_purchases.owner_email`). App
  sign-ups get the operator text only.
- Each message is claimed in `lifecycle_sends` (unique per org + key) before it is sent: a retry,
  a second worker or a re-run can't send it twice. A failed send is recorded and not retried.
- CASL: every email names Everdoer Technologies Inc. with its mailing address and says how to opt
  out (reply "stop"). Opt-outs are handled by hand for now: to stop one account, insert its
  remaining keys into `lifecycle_sends` with status `opted_out`.
- No dollar amounts in code: the trial-ending prices are read from Stripe when the email is sent;
  if Stripe can't be read the email says "your plan's monthly price".

## Settings ([worker])

- `EVERDOER_OPERATOR_PHONE` — Marcus's cell. Unset = no texts.
- `LIFECYCLE_ENABLED` — `false` turns the whole pass off. Default on.
- Uses the existing `EVERDOER_OPERATOR_EMAIL`, `RESEND_API_KEY`, `OUTBOUND_FROM_EMAIL`,
  `TWILIO_*`, `PLATFORM_SMS_NUMBER`, `STRIPE_SECRET_KEY`, `STRIPE_AUTOMATIC_TAX`.

## Checking it

`select organization_id, key, channel, recipient, status, error, created_at from lifecycle_sends order by created_at desc;`
