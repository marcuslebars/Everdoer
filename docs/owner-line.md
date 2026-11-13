# The owner line: call your AI

When the **owner** calls their own business number from their own phone, they reach their
assistant instead of the receptionist. It can talk about anything, look things up on the web,
and do everything the owner can already do by text.

Status: **pilot**. Off unless switched on per organization (see Setup).

## What it does

| The owner asks | How it answers |
|---|---|
| A general question (how something works, advice, wording, maths, strategy) | The model itself. No tool, no limits to "the business". |
| Something current (weather, news, a price, another business's hours) | `web_lookup`: one Claude call with Anthropic's web search, answered in a sentence or two. |
| Something about the business (today's jobs, who's waiting, a customer, open times) | `business`: runs the owner's text-command agent (`owner-channel/agent.ts`) with the spoken request. |
| A change (move or cancel a booking, text or call a customer) | `business` proposes it; the code that confirms it is **texted** to the owner's phone and they text it back, exactly as by text. |

Calls and texts share one memory (`agent_turns`, channel `owner_sms`): a later text can say
"actually make it 4" about something asked on a call. The assistant uses the name and tone from
**Your AI**.

Prices, hours, service area and booking setup are in the per-call prompt (the same fact sheet
the texting agent gets), so quick questions about the business need no tool.

## How a call gets there

One shared Retell agent (`voice/owner-agent.ts`) whose prompt is `{{system_prompt}}`. Each call
carries its own prompt, built in `voice/owner-line.ts` from the company's facts.

- **The business's own number (one number for everything, Twilio).** `/api/twilio/voice/inbound`
  checks the caller before it stores a missed call. Caller ID equal to the called company's
  **verified** owner cell → the call is registered with the owner agent and bridged over SIP. It is
  not a missed call: nothing is enqueued, so no lead and no text-back.
- **A dedicated Retell number.** `/api/retell/inbound` answers Retell's inbound webhook with
  `override_agent_id` for that one call.

Not the owner, the owner line off, a slow lookup or any failure → the call carries on exactly
as before.

`/api/retell/webhook` ignores owner-line calls (`isOwnerLineWebhook`): no "answering a call"
text, no lead, no call record.

## Who is really calling

Caller ID can be forged, so it is never enough for business data.

1. The company and the caller are fixed when the call arrives and carried in the call's metadata
   with an HMAC token (`voice/owner-line-token.ts`). Every tool call re-verifies the token and
   re-checks that the caller's number is still the company's verified owner cell. The model's
   arguments never choose a company.
2. General questions and `web_lookup` need nothing more: they expose nothing.
3. `business` needs a **verified caller**:
   - Twilio reports full carrier attestation for the call (`StirVerstat=TN-Validation-Passed-A`), or
   - the caller reads back a six-digit code texted to the owner's cell during the call. The
     assistant asks for it the first time `business` is used.
4. Changes are still confirmed by a code texted to the owner's cell. Nothing is changed from the
   call alone.

`OWNER_LINE_TRUST_CALLER_ID=1` treats a matching caller ID as verified. It exists for a pilot on
your own account; leave it off otherwise.

## Setup

1. Web search: switch it on for the organization in the Claude Console (the `web_lookup` tool
   says it can't look things up until it is).
2. Create the agent:

   ```
   npm run job:retell-owner-agent              # dry run: prints the config
   npm run job:retell-owner-agent -- --apply   # creates it; prints the two ids
   ```

3. On the **web** service set:

   | Variable | Value |
   |---|---|
   | `RETELL_OWNER_AGENT_ID` | printed by the job |
   | `RETELL_OWNER_LLM_ID` | printed by the job (so a re-run updates in place) |
   | `OWNER_LINE_ORG_IDS` | the organization ids it is on for, comma-separated; `*` = all |

   Optional: `RETELL_OWNER_AGENT_MODEL` (default `claude-5.5-sonnet`), `RETELL_OWNER_AGENT_VOICE_ID`,
   `OWNER_LINE_MAX_CALL_MINUTES` (default 20), `OWNER_LINE_TRUST_CALLER_ID`.

   It also needs what phone answering already uses: `RETELL_INTAKE_ENABLED=1`, `RETELL_API_KEY`,
   `RETELL_FUNCTION_SECRET`, `APP_BASE_URL`.

4. The owner's cell must be set and **confirmed** on the business (Settings → Business → Your cell).
5. Call the business's Everdoer number from that cell.

To change the tools or the model, re-run step 2 with `--apply`.

## Known gaps (pilot)

- **Minutes aren't metered.** Owner calls don't count against the plan's AI minutes; the per-call
  cap (`OWNER_LINE_MAX_CALL_MINUTES`) is the only limit.
- **Testing the receptionist.** With the owner line on, the owner calling their own number from
  their own cell no longer reaches the receptionist. Call from another phone to hear it.
- **Several businesses on one cell.** The business is the one whose number was dialled.
- **Retell stores the call** (recording and transcript) under its default settings.
- The mobile app and the web app have no "call your AI" entry point yet.
