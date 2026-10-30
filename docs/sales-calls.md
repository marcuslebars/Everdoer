# Sales calls: speed-to-lead and owner-requested

The AI phones a lead to help them buy: it answers their questions, recommends the right service,
quotes from the company's own price list, books a time and texts a deposit link. It calls:

- **Speed-to-lead:** a set number of minutes after a web lead ticks "you can call me with your
  automated assistant", when the business has lead calls turned on.
- **When the owner asks:** "call Dave and see if he wants to book the spring cleanup", confirmed
  with a code, like every other call.

The owner gets one text with the result, for example `New-lead call - Sam Lee: booked. Interested
in: gutter cleaning. …`, or `voicemail after 2 tries`.

Front Desk only: the company needs its own AI (Retell) phone number, which is also the caller ID
and the number a customer can call back on. It also needs the shared sales agent
(`RETELL_SALES_AGENT_ID`).

## Compliance

An AI voice that calls to sell is treated as an automatic dialing-announcing device under the
[CRTC Unsolicited Telecommunications Rules](https://crtc.gc.ca/eng/phone/telemarketing/tobligations/rules-regles.htm).
That means express consent is required, and so are calling hours, identification and an internal
do-not-call list. CRTC consultation 2026-132, opened June 2026, is asking whether AI voices should
be covered explicitly and disclosed as not a live person. We already do both. Every rule is
re-checked when the call is dialed, not only when it was queued.

| Rule | How |
| --- | --- |
| **Only verified submissions** | A web-form lead that didn't pass the bot check (Turnstile not verified) records no consent and is never called, so a bot can't get a stranger called. Signed intake from the business's own site counts as verified. |
| **Express consent to automated calls, for this number** | `call_consents`, one evidence row per grant, writable only by the service role. Sources: `form_optin` (the checkbox, with the exact wording shown), `owner_attested` (the owner confirmed with a code that the customer asked to be called) and `customer_request`. Consent is for a number: if the contact's phone changes, it no longer applies. Implied consent (just enquiring) is never enough. |
| **Calling hours** | Weekdays 9:00–21:30 and weekends 10:00–18:00, in the company's time zone. A call isn't started within 15 minutes of the end. Outside the window it waits for the next opening. |
| **Identify and disclose** | The opening line is: *"Hi, is this Sam? This is the automated assistant calling for Northshore Home, and this call may be recorded."* It then gives the reason for the call. |
| **Do-not-call** | `do_not_call`, per company and number, kept for 3 years and 14 days (a repeat request renews it). A "don't call me" on a call (the post-call field `do_not_call_requested`, or outcome `do_not_call`) adds the **number that was dialled**, revokes its consent and cancels any waiting call. This happens whatever Retell's success verdict is, even if the row was already closed. The agent apologises and ends the call; it never argues. Owner `call_customer` calls also refuse a listed number. |
| **Caps** | `dailyCap` sales calls per company per local day (default 40). Over the cap, the call moves to tomorrow's opening. |
| **No pressure** | The prompt forbids discounts, invented urgency and promises a tool didn't confirm. Prices are only quoted from the price-list tool. |
| **Wrong number** | Consent for that number is revoked, but it isn't added to the do-not-call list. |

## Settings (`companies.sales_call_settings`)

| Key | Default | Range |
| --- | --- | --- |
| `enabled` (speed-to-lead) | `false` | |
| `delayMinutes` | 5 | 1–1440 |
| `maxAttempts` | 2 | 1–3 |
| `retryMinutes` | 120 | 30–1440 |
| `dailyCap` | 40 | 1–200 |
| `voicemail` | `leave_message` | `leave_message` / `hang_up` |

By text: "turn on lead calls", "call new leads after 10 minutes", "try 3 times" (the
`lead_call_settings` tool). Owner-requested calls work even with `enabled` off.

## How it works

```
web form (consent box ticked) ─► lead intake ─► maybeScheduleSpeedToLead (sales-calls/speed-to-lead.ts)
                                                   records call_consents (always)
                                                   queues sales_calls (reason speed_to_lead) if enabled
owner text "call Dave…" ─► sales_call tool ─► code ─► executeSalesCallCommand (owner-request.ts)
                                                   (owner_attested consent if the owner said so)
                                                   queues sales_calls (reason owner_request), dials if open

scheduler (every tick) ─► processDueSalesCalls ─► placeSalesCall (sales-calls/queue.ts)
   claim scheduled → dialing ─► decideDial: agent set up · callable phone · not do-not-call ·
   consent · enabled (speed-to-lead) · company number · not already in touch (speed-to-lead:
   booked or called us since) · calling window → defer ─► daily cap → tomorrow ─► minutes
   ─► callContactWithMarina({ sales }) on RETELL_SALES_AGENT_ID, from the company's number,
      per-call prompt buildSalesCallPrompt as {{system_prompt}}, metadata.salesCallId

Retell call_analyzed ─► captureOutboundOutcome ─► recordSalesCallOutcome
   completed / failed · do-not-call · wrong number · retry (no answer, attempts left: a new row
   at nextCallableAt(now + retryMinutes)) · ONE owner text (a speed-to-lead call that will be
   retried waits for the last attempt)
```

States: `scheduled → dialing → placed → completed | failed`, plus `cancelled` and `skipped`
(with `skip_reason`). A placement that throws is `failed` and is never redialed, because an
ambiguous timeout must not become two calls. The sweep fails a claim older than 15 minutes that
has no call id. A `placed` row with no result after 2 hours is closed as failed, with no retry and
no owner text. There is one open call per customer (partial unique index). The calling window and
the cap's day are read from a live clock at dial time, not from when the sweep started. The owner
gets one text per lead, after the last attempt.

**Tools on the call.** The shared sales agent has `find_services`, `quote_services`,
`check_availability`, `book_job`, `send_deposit_link`, `message_owner`, `business_notes` and
`end_call`. It doesn't have `capture_lead` or the invoice skills. Tool requests on a sales call
(outbound, with `metadata.salesCallId`) are normalised in `retell/functions.ts`: `fromNumber` is
the customer and `toNumber` the business line. That way every tool finds the company by its own
number and the customer by the number we dialled. Other outbound agents keep Retell's numbers. The quote tool files its lead with the normalised numbers, never Retell's
raw outbound `to_number`.

## Setup

1. Run migration `20261029100000_sales_calls.sql`. Rollback:
   `supabase/rollback/20261029100000_sales_calls.down.sql`.
2. Create the sales agent: run `npm run job:retell-sales-agent` (a dry run that prints the
   config), then `npm run job:retell-sales-agent -- --apply`. Set the printed
   `RETELL_SALES_AGENT_ID` and `RETELL_SALES_LLM_ID` on the **web and worker** services. Re-run
   it with both set whenever the tools or analysis fields change.
3. Make sure `RETELL_OUTBOUND_ENABLED=1` and `RETELL_API_KEY` are set on both services (they
   already are for owner call requests).
4. For each business that wants it, the owner texts "turn on lead calls" (or the operator sets
   `sales_call_settings.enabled`). The consent checkbox shows on the hosted / embedded form as
   soon as the business has an AI number.
5. Test: submit the form with the box ticked using your own phone, then answer the call. Expect
   the opening line, a quote by text if you ask, and the result text to the owner. Say "please
   don't call me again" and check the number lands in `do_not_call`.

## Files

`src/server/services/sales-calls/` (`settings.ts`, `compliance.ts`, `queue.ts`,
`speed-to-lead.ts`, `owner-request.ts`), `retell/outbound-prompt.ts` (`buildSalesCallPrompt`),
`voice/sales-agent.ts` + `jobs/retell-sales-agent.ts`, `voice.ts` (`sales` option),
`retell/functions.ts` (outbound normalisation), `retell/lead-adapter.ts` (outcome routing),
`owner-channel/tools.ts` (`sales_call`, `cancel_sales_call`, `lead_call_settings`),
`lead-intake/public-form-envelope.ts` (`callConsentText`) and `PublicLeadFormPage.tsx`.

## Not yet

- The consent checkbox on generated done-for-you sites (their content is a stored snapshot) and
  on the A1 sites (they can send `meta.callConsent` in the lead envelope today).
- App screens: the settings toggle and a list of sales calls. The data is in `sales_calls`, and
  members can read it.
- A live transfer to the owner from a sales call (the shared agent has no per-company transfer
  number).
- Recording consent when a customer asks for a call back by text or on an inbound call
  (`customer_request` is reserved for that).
