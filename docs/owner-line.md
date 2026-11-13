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
| "Any new leads?", "which quotes are still out?", "who owes me?", "what's my day?" | `business`, with the day-to-day tools below. Read-only. |
| A change (move or cancel a booking, text or call a customer) | `business` proposes it; the code that confirms it is **texted** to the owner's phone and they text it back, exactly as by text. |
| Something about another of their businesses | `business` with `business_name` (see "More than one business"). |

Calls and texts share one memory (`agent_turns`, channel `owner_sms`): a later text can say
"actually make it 4" about something asked on a call. The assistant uses the name and tone from
**Your AI**.

Prices, hours, service area and booking setup are in the per-call prompt (the same fact sheet
the texting agent gets), so quick questions about the business need no tool.

## The brief

What the owner wants the assistant to know before they say a word: who they are, what each of
their businesses does, what matters this month, how they like things done. It goes into every
call's prompt, fenced as `<owner_brief>`, ahead of the rules.

- **Where it is set:** Your AI → "When you call <name>". The card shows only where the owner
  line is switched on for the organization, and only to owners and admins.
- **Where it is stored:** `companies.ai_settings.owner_line.brief` (`voice/owner-brief.ts`),
  written through the one `ai_settings` writer. No migration. It is the owner's data and is
  **never in this repository**. Like the rest of `ai_settings`, a team member's session can read
  the company row; the app shows and changes the brief for owners and admins only. If that is
  not private enough, the next step is its own owner-only table.
- **One owner, one brief:** a call uses the dialled business's brief; if it has none, the first
  one found on the owner's other businesses in the same organization.
- Plain text, at most 6,000 characters. `{{placeholders}}` are removed on save (the shared
  agent's prompt is a template).
- The brief is background. Live records come from the `business` tool, and the prompt says the
  tool wins when the two disagree.

## What it can do in the business

Everything the owner can do by text, plus four read-only tools that are offered **only on the
owner line** (`owner-channel/assistant-tools.ts`, switched on by `assistant: true` on the
command agent). The owner-by-text agent and the AI staff's plan defaults are unchanged.

| Tool | Answers |
|---|---|
| `new_leads` | People still marked a lead who came in over the last N days (default 14): the count and the newest ten. |
| `open_quotes` | Quotes sent and waiting on the customer, approved without a deposit, drafts never sent: counts, totals, the newest ten. |
| `money_owed` | Outstanding, overdue, and the five who owe the most. Left out when the Bookkeeper is on for the business: its `who_owes_me` answers instead (and `cash_snapshot`, `remind_now`, `record_offline_payment` come with it). |
| `briefing_now` | The Office manager's morning briefing, on demand. Offered here even when the morning text is off. |

Switching an AI staff role on for a business (Your AI) adds that role's own owner tools to the
call as well: the Bookkeeper's reminders and payments, the Dispatcher's weather and crew plan,
the Profit advisor's numbers, and so on.

Not yet: creating or sending a quote or an invoice by voice.

## More than one business

The call belongs to the business whose number was dialled: its facts are in the prompt and
`business` works on it by default. When the owner names another of their businesses, the
assistant passes `business_name` and that one request runs there instead.

- Reachable businesses are the ones in the **same organization** whose **verified owner cell is
  the caller's number** (`switchableCompanies`), re-read on every tool call. Their names are
  listed in the prompt. The model's argument only picks among those; another organization's
  company, or one the caller isn't the verified owner of, can't be named into reach.
- An unknown name is answered with the names that can be reached; a name that fits more than
  one asks which.
- One business per request. Confirmation codes, memory and the hourly limit follow the business
  the request ran for.
- To make a business reachable: set and confirm the same cell on it (Settings → Business →
  Your cell).

## How a call gets there

One shared Retell agent (`voice/owner-agent.ts`) whose prompt is `{{system_prompt}}`. Each call
carries its own prompt, built in `voice/owner-line.ts` from the owner's brief and the company's
facts.

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
   arguments never choose a company outside the caller's own (see "More than one business").
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
   npm run job:retell-owner-agent                        # dry run: prints the config
   npm run job:retell-owner-agent -- --apply             # creates it; prints the two ids
   npm run job:retell-owner-agent -- --check             # reads the live agent back; changes nothing
   npm run job:retell-owner-agent -- --apply --publish   # update, then publish that version
   ```

3. On the **web** service set:

   | Variable | Value |
   |---|---|
   | `RETELL_OWNER_AGENT_ID` | printed by the job |
   | `RETELL_OWNER_LLM_ID` | printed by the job (so a re-run updates in place) |
   | `OWNER_LINE_ORG_IDS` | the organization ids it is on for, comma-separated; `*` = all |

   Optional: `RETELL_OWNER_AGENT_MODEL`, `RETELL_OWNER_AGENT_VOICE_ID` (see "The model and the
   voice"), `OWNER_LINE_MAX_CALL_MINUTES` (default 20), `OWNER_LINE_TRUST_CALLER_ID`.

   It also needs what phone answering already uses: `RETELL_INTAKE_ENABLED=1`, `RETELL_API_KEY`,
   `RETELL_FUNCTION_SECRET`, `APP_BASE_URL`.

4. The owner's cell must be set and **confirmed** on the business (Settings → Business → Your cell).
5. Call the business's Everdoer number from that cell.

### What lives where

| | Where it lives | Who changes it |
|---|---|---|
| The real prompt | Built per call by the app (`buildOwnerLinePrompt`: the brief, the rules, the business facts) | A release, and the owner's brief in Your AI |
| The prompt box in Retell | Exactly `{{system_prompt}}`. Anything else there and calls ignore their own prompt | The job (`--apply` puts it back) |
| The tools (`business`, `web_lookup`, `end_call`) | On the Retell agent | The job. A release that changes `buildOwnerAgentTools` needs `--apply` |
| The model and the voice | On the Retell agent | Retell's dashboard, or the two variables below |

Do not paste a prompt into Retell's prompt box. Put what the assistant should know about the
owner in Your AI ("When you call <name>"); it reaches every call from there.

### The model and the voice

A new agent is created on `claude-5.5-sonnet` with the default voice. After that the job
**keeps whatever model and voice the live agent has**, so the model can be switched in Retell's
dashboard (for example to a speech-to-speech model such as Grok Voice) and a later `--apply`
does not undo it. Tools added to the agent by hand are kept too.

To set them from here instead: `RETELL_OWNER_AGENT_MODEL` (a text model such as
`claude-5.5-sonnet`, or a speech-to-speech one such as `grok-voice-3.0` or `gpt-realtime-2.1`,
which is sent as `model_config` type `s2s`) and `RETELL_OWNER_AGENT_VOICE_ID`. A speech-to-speech
model speaks with its own voices: a new agent on one needs the voice id set.

### Versions and publishing

Retell's update endpoints write to the agent's latest **draft** version; a published version is
read-only. After `--apply`, either add `--publish` or publish the draft in the dashboard.
`--check` prints the version it read and whether it is published.

`--check` is read-only and prints, without any secret: the model, the voice, whether the prompt
is the passthrough, each tool as ok / MISSING / OUT OF DATE (and why), and the version. It exits
non-zero when something this job owns is not in place.

## Known gaps (pilot)

- **Minutes aren't metered.** Owner calls don't count against the plan's AI minutes; the per-call
  cap (`OWNER_LINE_MAX_CALL_MINUTES`) is the only limit.
- **Testing the receptionist.** With the owner line on, the owner calling their own number from
  their own cell no longer reaches the receptionist. Call from another phone to hear it.
- **Several businesses on one cell.** Facts in the prompt are the dialled business's only; the
  others are reached one request at a time through `business_name`.
- **Long answers are short.** The command agent replies in text-message length, so a briefing
  or a list comes back as the headline and the top few.
- **Retell stores the call** (recording and transcript) under its default settings.
- The mobile app and the web app have no "call your AI" entry point yet.
