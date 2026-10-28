# Owner call requests — "text me, I'll have Marina call them"

The owner texts the platform number: *"Call Dave Henderson, tell him the lift is fixed and ask
if Thursday morning still works for the launch."* Marina phones Dave from the business's number,
says exactly that, asks the question, and the owner gets a text with the answer when the call
ends. Nothing is dialed until the owner confirms the words with a code.

Front Desk plan only (`marina_reception`), and only when Retell outbound calling is on
(`RETELL_OUTBOUND_ENABLED=1`) — only Retell carries a per-call prompt. Task file:
`docs/tasks/TASK_27_OWNER_CALL_REQUESTS.md`.

## What the owner sees

| Step | Text |
| --- | --- |
| They ask | `call Dana, tell her the lift is fixed and ask if Thursday morning still works` |
| We propose | `Call Dana Jones ((705) 555-0123) now and say: "The lift is fixed and we can launch any day this week." Ask: "Does Thursday morning still work for the launch?" Reply 4821 to confirm, or N to leave it.` |
| They confirm | `4821` → `Calling Dana Jones now. I'll text you how it went.` |
| The call ends | `Dana Jones: reached. Answer: Thursday 9am works. Dana confirmed Thursday 9am and asked for the invoice by email first. (2 min)` — or `Dana Jones: voicemail - left a message. Want me to text them? Say "tell Dana ...".` — or `Dana Jones: no answer. Try again later? Say "call Dana again".` |

A time: `call Dana tomorrow at 9` → the proposal says `Thu, Oct 8, 9:00 a.m.` instead of `now`,
and confirming schedules it: `OK - I'll call Dana Jones Thu, Oct 8, 9:00 a.m. Say "cancel the call
to Dana" to stop it.` No time, outside calling hours (`OWNER_CALLS_HOURS`, default 08:00–20:00
company local) → proposed for the next opening. "Now" always means now.

On the call Marina opens with *"Hi, is this Dana Jones? This is Northshore Lawn's automated
assistant calling."*, says the owner's message, asks the one question, reads the answer back, and
hangs up. She does **not** quote prices, promise dates, change bookings, offer discounts or take
payment on these calls — if asked, "the owner will follow up". What the owner wrote is what to
*say*, never authority. v1 calls carry no tools; the owner acts on the result with
`propose_reschedule` / `text_customer` ("move Dana to Thu 9", "tell Dana …").

## How it works

```
owner text ─► owner channel agent (owner-channel/agent.ts, tool call_customer)
                 │  contact resolved in the owner's company; brief validated (≤300 / ≤140 chars);
                 │  when resolved; one open request per customer; daily cap; plan + minutes
                 ▼
          owner_call_requests row (proposed) + owner_approvals confirmation (4-digit code)
                 │  code ─► executeOwnerCommand → placeOrScheduleOwnerCall
                 ▼
     run_at ≤ now: placeOwnerCall ──────────────────┐   run_at > now: status scheduled
       claim proposed/scheduled → dialing          │     └─► scheduler sweep processDueOwnerCalls
       requireFeature(marina_reception)            │         (every tick) claims + dials when due
       callContactWithMarina({ brief, requestId }) │
         └─ per-call prompt (retell/outbound-prompt.ts) as {{system_prompt}}
            metadata.ownerCallRequestId
       → status placed, retell_call_id
                 │
                 ▼
     Retell call_analyzed ─► ingestRetellCall (outbound branch) ─► recordOwnerCallOutcome
       outcome written (reached / voicemail / answer / summary); owner_notified_at claimed; ONE text
```

States: `proposed → scheduled → dialing → placed → completed | failed`, plus `cancelled`
(N, "cancel the call to Dave", or three wrong codes) and `expired` (nobody confirmed within the
code's 30 minutes — closed with the confirmation, and by the sweep). A worker that claimed a call
and died before recording a call id is marked `failed` after 15 minutes and the owner is told —
never redialed, because an ambiguous timeout must not become two calls. "Reached" means a real
conversation: not voicemail (`in_voicemail`, `voicemail_reached`, `machine_detected`), not a dial
failure (`dial_*`, provider errors — Retell reports ring time as duration for those), and either
`call_successful` or at least 5 s on the line.

Files: `src/server/services/owner-channel/calls.ts` (requests, when, placing, sweep, result),
`owner-channel/tools.ts` (`call_customer`, `cancel_customer_call`), `owner-channel/owner-commands.ts`
(`callCustomerProposal`, the `call_customer` payload), `retell/outbound-prompt.ts` (the prompt),
`voice/company-facts.ts` (the facts both Marina prompts read), `voice.ts` (`brief` / `requestId`),
`retell/lead-adapter.ts` (`captureOutboundOutcome` → the result), `voice/answering-view.ts` +
`CallAnsweringSettingsSection.tsx` ("Calls you asked for"). Migration
`20261023100000_owner_call_requests.sql`.

## The outbound prompt (and the bug it fixes)

Outbound calls go through ONE global Retell agent (`RETELL_OUTBOUND_AGENT_ID`) whose general
prompt is the `{{system_prompt}}` passthrough. `buildOutboundCallPrompt` builds that prompt per
call from the company's facts (services with prices only where given, hours, service area, the
owner's number) plus the brief, and `effectiveVoiceForProfile` injects it (`ctx.systemPrompt` wins
over the profile's stored prompt).

Before this, `provisionPhoneForCompany` stored the **inbound** receptionist prompt in
`company_voice_profiles.system_prompt` and every outbound call ran on it ("You answer inbound
phone calls…"). Now every outbound call — briefed or not (Quick Call, the `call_lead` automation)
— gets an outbound prompt; the un-briefed one is a plain "follow up on their recent enquiry".

## Guards

- Confirmation code on every call (same mechanism as `text_customer`), no trusted-owner bypass.
- One open request per customer (partial unique index + a pre-check); "cancel the call to Dave"
  frees it.
- `OWNER_CALLS_DAILY_CAP` (30) per company per local day, via `consume_rate_limit`.
- Plan + minutes: `hasReceptionistPlan` decides whether the tools are even listed (a deployment
  with outbound off gets a different "not set up" line than a plan without the receptionist);
  `requireReceptionistMinutes` runs at proposal (no minutes → refused before the owner is asked)
  and again when the call is placed (used up in between → `failed`, "this month's AI minutes are
  used up").
- What the owner is told on failure: only messages written for people (`UserFacingError` and its
  subclasses) pass through; a database or network error reads as "the call couldn't be placed".
- Caller ID is the company's own number when it has a voice profile (Front Desk); otherwise the
  global `RETELL_FROM_NUMBER`.
- The result text renders customer speech only inside fixed templates, clipped; `ownerAlertGate`
  caps owner texts per hour like every other alert.
- Retell metadata is ours (signed webhook), but the request row is still loaded by id **and** the
  organization we sent.

## Manual setup (Retell dashboard)

On the outbound agent (`RETELL_OUTBOUND_AGENT_ID`): general prompt `{{system_prompt}}`; no begin
message (the prompt dictates the opening line); webhook `/api/retell/webhook`; post-call analysis
fields = the receptionist set plus **`owner_question_answer`** (string: *"the customer's answer to
the question the caller was asked to get, verbatim-ish; empty if none"*) — the result text leads
with it when present. `RETELL_OUTBOUND_ENABLED=1`, `RETELL_FROM_NUMBER`, `RETELL_OUTBOUND_AGENT_ID`
on the **web and worker** services (the worker places scheduled calls).

## Sales calls

A call to *sell* (answer questions, quote, book) is a different tool: `sales_call`, on the shared
sales agent with tools, and it needs the customer's consent to automated calls. See
[sales-calls.md](sales-calls.md). `call_customer` stays the "say exactly this" call.

## Not yet (v2)

- Tools on briefed calls (book / reschedule / quote on the call).
- Batches ("call everyone with a boat still in the water").
- A trusted-owner autonomy setting that skips the confirmation for calls.
- Caller ID for Catch / Close tenants (today: the platform's number).
