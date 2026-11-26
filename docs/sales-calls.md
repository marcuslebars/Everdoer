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
| **Identify and disclose** | The opening line is: *"Hi, is this Sam? Hey, it's Everly, the AI assistant over at Northshore Home. Just so you know, calls are recorded."* (with the owner's chosen name). It's said naturally but always keeps who's calling, that it's an AI and that calls are recorded, then gives the reason for the call. |
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
app "Call with Everly" + instructions ─► /contacts/[id]/ai-call ─► requestAiCallFromApp (app-request.ts)
                                         both ─► startOwnerSalesCall
                                                   (owner_attested consent if the owner said so)
                                                   queues sales_calls (reason owner_request,
                                                   with the owner's instructions), dials if open

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

## Calls with your instructions

The owner tells the AI what to do on a call to one of their contacts: *"Ask if Kim still wants the
spring cleanup. Mention we have Tuesday open. If she's ready, book it and offer our 10%
repeat-customer discount."* It's an `owner_request` sales call that carries the owner's words
(`sales_calls.instructions`, up to 1000 characters; migration
`20261125100000_sales_call_instructions.sql`).

- **From the app:** "Call with Everly" on a contact (header, inbox, CRM list) opens
  `components/voice/AiCallDialog.tsx`. Write the instructions, pick now or a time, and tick
  "they asked us to call" when no consent is on file (recorded as `owner_attested`, evidence
  "<user> confirmed in the app…", `source_ref app:<profile id>`). Owners and admins only.
  `/api/organizations/[orgId]/contacts/[contactId]/ai-call`: GET the panel (availability,
  consent, do-not-call, the contact's last 10 AI calls with a plain result line), POST a call,
  DELETE `?id=` a waiting one. Service: `sales-calls/app-request.ts`. An empty box keeps the
  original one-tap follow-up call (`/contacts/[contactId]/call`).
- **By text:** the `sales_call` tool's `focus` now carries the owner's whole instructions (up to
  1000 characters, not reworded). The confirmation shows the first 160 characters; the call
  gets all of it.
- Both go through `owner-request.ts → startOwnerSalesCall`: contact in the caller's own
  organization + company, do-not-call, consent (or the owner's word), queue, dial now when
  calling hours are open. Every dial-time rule runs again in `placeSalesCall`, and retries keep
  the instructions.
- **On the call** (`buildSalesCallPrompt` with `instructions`): the owner's instructions come
  first, ahead of the general sales steps, fenced in «…». Every rule still applies: the AI says
  it's automated, stops when someone doesn't want calls, never pressures, and only promises what
  a tool confirms or the instructions state. A discount or deal is allowed only when the
  instructions give one, and then exactly that. Anything the rules don't allow is skipped with
  "the owner will follow up". It checks it covered every point before wrapping up.
- **The result:** the sales agent's post-call analysis has `instructions_result` (what came of
  the instructions, answers to anything it was asked to find out). The owner's text leads with
  "Your instructions: …", and the app shows it on the call. After deploying, re-run
  `npm run job:retell-sales-agent -- --apply` so Retell's agent gets the new analysis field.

## How the calls sound

Every outbound prompt (sales, owner instructions, owner message calls, Everdoer's callback and
line) includes `NATURAL_SPEECH_LINES` from `retell/outbound-prompt.ts`: short turns, contractions
and everyday words, reacting to what was said, one question at a time, never reading a list or
the instructions out, numbers said the way people say them. Owner instructions are covered as a
conversation, one point at a time. The opening lines are "Start with … (say it naturally)" rather
than word-for-word, but must keep the disclosures.

The voice and conversation feel (voice, speed, temperature, responsiveness, interruption
sensitivity, backchannel, model) are tuned in the Retell dashboard on the shared sales agent
(`RETELL_SALES_AGENT_ID`). `job:retell-sales-agent -- --apply` sets them only when it creates the
agent; on an update it sends only what the code owns (prompt passthrough, tools, webhook,
post-call analysis), so dashboard tuning survives a re-run.

A person who picks up and hangs up (`user_hangup` after 5+ seconds, not voicemail) counts as
reached: no retry.

## Everdoer's own callback ("Have Everly call me now")

everdoer.com has a form where a trades owner asks Everly to call them now. It is an ordinary
speed-to-lead lead for one company, the **Everdoer** company in the internal Everdoer Demo org
(plan `internal`, never billed), named by `EVERDOER_CALLBACK_COMPANY_ID`. For that company only
(`sales-calls/everdoer-callback.ts`):

- the call is dialed straight from intake (`placeSalesCall` with `claimedBy: "intake"`) instead
  of waiting for the scheduler, so it rings within seconds. Every dial-time rule still runs:
  outside calling hours it waits for the next opening like any other call;
- the prompt is `buildEverdoerDemoCallPrompt`: Everly says who she is, offers to answer as the
  caller's own receptionist while they play a customer, answers questions about Everdoer from
  the company's price list (the plans) and saved notes only, and sends demo requests to Marcus
  with `message_owner`. She doesn't use the quoting or booking tools on these calls.

The consent wording is the platform's `callConsentText("Everdoer")`, recorded server-side, so
the company must be named exactly "Everdoer".

The same number is Everdoer's inbound sales line (`sales-calls/everdoer-inbound.ts`). Retell's
inbound webhook (`/api/retell/inbound`) hands calls to it to the shared sales agent with
`buildEverdoerInboundPrompt`: the same demo, facts and rules as the call-back, plus paths for an
existing customer (message to Marcus, urgent if their phones are down) and wrong numbers. The
call is still filed like any inbound call (lead + owner summary text). If the prompt can't be
built in time, or `RETELL_SALES_AGENT_ID` isn't set, the number's own receptionist answers.

Setup:

1. Mark the org internal (`organizations.plan = 'internal'`) and cancel any Stripe subscription
   it had. The job refuses an org that isn't internal.
2. `npm run job:everdoer-callback-setup` (dry run), then `-- --apply`. It creates the company,
   the plans, the notes, lead-call settings, a `contact` form key limited to everdoer.com, and
   buys one Retell number (area code 249, then 705). Re-runnable.
3. Set the printed `EVERDOER_CALLBACK_COMPANY_ID` on the **web and worker** services.
4. On everdoer.com, set `VITE_CALLBACK_FORM_KEY` (printed) and redeploy. The form reads the
   consent wording and the Turnstile site key from the public form config, so add
   `everdoer.com` and `www.everdoer.com` to the Turnstile widget's hostnames.
5. Test with your own phone only. The National DNCL registration (Everdoer as a telemarketer)
   must be done before it's promoted.

Prices and facts are data: change a plan price in the app's price list and a fact in Notes for
the Everdoer company; nothing needs a deploy. Keep them in step with everdoer.com's
`src/config.ts` and its claims ledger.

## Files

`src/server/services/sales-calls/` (`settings.ts`, `compliance.ts`, `queue.ts`,
`speed-to-lead.ts`, `owner-request.ts`, `app-request.ts`, `everdoer-callback.ts`, `everdoer-inbound.ts`, `everdoer-callback-setup.ts`
+ `jobs/everdoer-callback-setup.ts`), `retell/outbound-prompt.ts` (`buildSalesCallPrompt`),
`voice/sales-agent.ts` + `jobs/retell-sales-agent.ts`, `voice.ts` (`sales` option),
`retell/functions.ts` (outbound normalisation), `retell/lead-adapter.ts` (outcome routing),
`owner-channel/tools.ts` (`sales_call`, `cancel_sales_call`, `lead_call_settings`),
`lead-intake/public-form-envelope.ts` (`callConsentText`) and `PublicLeadFormPage.tsx`.

## Not yet

- The consent checkbox on generated done-for-you sites (their content is a stored snapshot) and
  on the A1 sites (they can send `meta.callConsent` in the lead envelope today).
- App screens: the settings toggle and a list of every sales call (a contact's own AI calls show
  in its "Call with Everly" dialog). The data is in `sales_calls`, and members can read it.
- A live transfer to the owner from a sales call (the shared agent has no per-company transfer
  number).
- Recording consent when a customer asks for a call back by text or on an inbound call
  (`customer_request` is reserved for that).
