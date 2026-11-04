# Your AI: plain switches

The **Your AI** page (`/ai`, under More, and linked from Home) is where an owner decides what the
assistant does, in plain words. It doesn't use role names like "estimator" or "dispatcher". The
page has two parts:

- **Your assistant:** the name it uses with customers and its tone (`companies.agent_persona`,
  docs/agent-blueprints.md). A change re-syncs the phone receptionist straight away.
- **Switches,** in five groups. Each one is exactly an existing setting, read through its role's
  own reader (so the defaults are the same as everywhere else) and written through its role's own
  merge. Nothing new is stored. **Customize** opens that setting's card in Settings → AI front
  desk (`?section=front-desk&focus=<card>`), where the details are: timings, wording and hours.

| Group | Switch | Setting |
| --- | --- | --- |
| Talking to customers | Answer customer texts (On its own / Ask me first) | `ai_settings.sms_agent.enabled` + `.autonomy` |
| | Answer your phone | `ai_settings.call_answering.mode`: `ai` on, `voicemail` off |
| | Call new leads right away | `sales_call_settings.enabled` (docs/sales-calls.md) |
| Getting paid | Follow up on quotes | `ai_settings.estimator.follow_ups`. Switching on also turns the estimator on. |
| | Chase unpaid invoices | `ai_settings.collections.enabled` and `.textReminders`. Switching on turns on both. Reminder emails are separate (`invoice_settings`, Settings → Invoices). |
| Running jobs | Reschedule for bad weather | `ai_settings.dispatch.weather.enabled` |
| | Text customers when you're on the way | `ai_settings.dispatch.on_our_way.enabled` |
| | Check in after each job | `ai_settings.customer_care.checkins.enabled`. Switching on also turns customer care on. |
| Growing | Ask for reviews | `review_settings.enabled`. Needs the review link first. |
| | Bring back past customers | `ai_settings.marketing.win_back.enabled` |
| Keeping you posted | Morning briefing | `ai_settings.office_manager.enabled` |
| | Weekly report | `ai_settings.weekly_report.enabled` |

**How the switches behave**

- **On counts what actually runs.** Texts with autonomy `off` show as off, and quote follow-ups
  show as off while the estimator is off.
- **Switching off a part leaves the rest of its role running.** For example, turning off check-ins
  keeps warranty cases going, and turning off follow-ups keeps estimates going.
- **A note shows when something is missing.** These switches still switch on, and start working
  once the missing piece is in place:
  - Check-ins and quote follow-ups go out by text, so they need "Answer customer texts" on
    (`careWorks`; follow-ups are for quotes the AI texted).
  - Weather needs at least one job type that depends on the weather. Indoor or unknown trades
    default to none.
  - The morning briefing needs a verified owner cell.
  - Lead calls need the company's AI number.
- **Some switches refuse instead.**
  - Reviews can't be switched on without the review link.
  - Lead calls can't be switched on outside the Front Desk plan, or before outbound calls and the
    sales agent are set up.
- **An automation doing the same job is named** (the quote follow-up or review request recipes,
  or an "on the way" automation that texts). Switching off here doesn't stop that automation, so
  the page links to Automations.

**Access.** Everyone in the org can see the page. Only owners and admins can change it.

**Code**

- Server: `src/server/services/your-ai/switches.ts`, with `readSwitches`, `aiSettingsMutation` and
  `overlappingAutomations` (all pure).
- API: `GET` / `PATCH /api/organizations/:org/companies/:company/your-ai`. The `PATCH` body is
  either `{ switch, on, choice? }` or `{ persona: { name, tone } }`.
- Client: `src/lib/your-ai-api.ts` and `src/screens/YourAiPage.tsx`.
- Tests: `your-ai.test.ts` and `your-ai-page.test.tsx`.

## Set up in onboarding

A new self-serve business turns its AI on in the wizard, right after the Phone step, instead of
finding these switches later. The **Your AI** step (`src/components/onboarding/YourAiStep.tsx`,
`POST /api/organizations/:id/onboarding/your-ai`, `src/server/services/onboarding-ai.ts`) does
what done-for-you does for its buyers, in one button:

1. **The trade's defaults:** the default blueprint for the company's industry pack
   (`applyDefaultBlueprintForPack`: tuning only, unattended), once per company. It runs first, so
   the owner's own choices below win.
2. **Name and tone** (`setYourAiPersona`, which re-syncs the phone receptionist).
3. **Answer customer texts: on**, with the owner's choice. The default is **Ask me first**: it
   gathers details and answers simple questions, and asks the owner before any price, quote or
   booking time. The other choice is **On its own**.
4. **Answer your phone: on**, unless the owner already chose voicemail.

Under the button, the step lists what is still missing for the AI to work fully. Each item links
to the step that fixes it (`src/lib/ai-readiness.ts`):

- **Number:** get your number (Phone step).
- **Cell:** confirm the owner's cell (Business step).
- **Prices:** price the services that have none (Services step).

**Owner's cell.** The Business step now confirms the cell straight away. After saving, it texts a
6-digit code and asks for it (`OwnerCellVerify`, the same routes as Settings → AI front desk →
Owner's cell). Until the cell is confirmed, approvals by text and owner commands don't work. The
step is also pre-filled from what's saved, and it sends only the fields that changed, so going
back and saving no longer wipes the website, hours or cell.
