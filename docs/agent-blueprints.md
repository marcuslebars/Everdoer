# Agent profiles and blueprints

A business's AI setup can be named, saved and copied to another business in one step: a new
done-for-you customer of the same trade, a second brand, or a fresh tenant. This is phase 5 of
the agent roadmap (docs/agent-kernel.md).

## The profile: name and tone (`companies.agent_persona`)

| Key | Values | Default |
| --- | --- | --- |
| `name` | A first name: letters, `'` or `-`, 2–20 characters | `{}` → the phone assistant is "Marina"; the texting agent has no name |
| `tone` | `friendly`, `professional`, `casual` | Each prompt's built-in tone |

These prompts read the profile (`agent/profile.ts`):

- **Phone receptionist** (`retell/provision.ts`): "You are Sam…" plus the tone line. Its prompt is stored in Retell, so the owner command re-syncs it straight away.
- **Sales and owner-requested calls** (`retell/outbound-prompt.ts`): the name in the opening line ("This is Sam, the automated assistant calling for…") and the tone.
- **Customer texting agent** (`sms-agent/prompt.ts`): "Your name is Sam." The voice line follows the tone, and the first-message intro uses the name.

With the profile empty, every prompt is exactly what it was before (golden tests).

By text, the `assistant_persona` owner tool: "call yourself Sam", "be more professional", "go back
to the normal name".

## Blueprints (`agent_blueprints`)

A blueprint is a versioned snapshot of one business's portable AI setup
(`agent/blueprints/content.ts`):

- the profile;
- every AI role's stored settings (each `companies.ai_settings` section). Only keys the business
  actually set are copied; the readers' derived fields are never stored;
- the policy columns the agents read: `booking_policy`, `online_booking_settings`,
  `visit_settings`, `review_settings`, `sales_call_settings`, `digest`, `monthly_scorecard`,
  `invoice_settings`, `cancellation_policy_text`, `quote_terms_text` and
  `quote_deposit_flat_cents`;
- the industry pack id, for reference.

**Never copied: tenant-specific data.**

| What | Why |
| --- | --- |
| `ai_settings.owner_pause` | Runtime state ("texts paused", with workflow ids) |
| `call_answering.included_minutes` | Plan / billing |
| `recruiter.payroll.csv_email`, `.anchor_date`, `.frequency` | That business's email and pay calendar |
| `tax_clerk.hst.registrant`, `.frequency`, `.fiscal_year_end_month`, `.filer`, `.accountant_email` | That business's tax facts |
| `invoice_settings.numberPrefix`, `.taxRateBps` | Its invoice numbering and province's tax rate |
| `invoice_settings.accept*`, `.etransferEmail`, `.etransferInstructions`, `.chequePayableTo`, `.chequeMailingAddress`, `.copyEmail` | The payment methods it takes and its details (card / bank debit need its own Stripe) |
| `online_booking_settings.depositMode` | Deposits need its own Stripe |
| Any setting that is a bare email address or phone number | Contact data |

An old snapshot read back goes through the same lists, so it can't carry these back in.

**Text is made generic.** In any text, the source's business name (and display name), phone
numbers (including local 7-digit ones), email addresses, website links and tax numbers become
`{{business_name}}`, `{{business_phone}}`, `{{business_email}}`, `{{business_website}}` and
`{{tax_number}}`. On apply they're filled from the target's name, `brand_reply_phone`,
`brand_reply_email`, `brand_website_url` and `tax_registration_number`.

- **A placeholder the target can't fill is never written.** That setting is skipped and the
  dry run says why.
- **Some details can't be detected,** such as a person's name or a street address inside a
  sentence. Check the dry run's text before applying to another customer's business.

**Versions.** `(name, version)` is unique. Saving the same name again makes the next version.
Applying by name uses the latest version unless one is given.

## Applying (`agent/blueprints/service.ts`)

- **Merge:** blueprint values win, and keys only the target has are kept (its own accountant
  email, tax facts, payment details). Arrays are replaced.
- **Weather services:** the dispatcher's weather-sensitive services are limited to service keys
  the target's catalog has.
- **Preview first.** The job is a dry run unless `--apply`. It lists every setting that would
  change.
- **Undo.** Each apply is recorded in `agent_blueprint_applications`, with the target's previous
  value for everything it touched. `revert` puts exactly those back: an AI section the target
  didn't have is removed again. A second revert is refused.
- **Modes.**
  - `full`: everything, including every on/off switch. A blueprint can therefore switch on a role
    the target's plan wouldn't turn on by default.
  - `tuning`: no switches at all, so the target's plan decides what runs. That means no boolean
    at any depth (nested `enabled` flags like `marketing.win_back.enabled` and the
    `sales_call_settings` / `review_settings` switches included) and no switch-like values
    (`call_answering.mode`, `sms_agent.autonomy`, `invoice_settings.autoInvoiceOnComplete`). The
    blueprint only tunes timings, cadences, limits and wording.
- **Bookings are safe.** `booking_policy` and `online_booking_settings` aren't replaced on a
  business that already has bookings, because existing bookings keep their window keys.
- **One write.** Persona, policy columns and AI sections go in a single update of the company
  row, guarded by its `updated_at`. On a conflict it re-plans against the fresh row, so a change
  made at the same moment ("pause all texts") is never overwritten. If the application record
  can't be saved, the write is rolled back.
- **Undo is careful.**
  - Revert only puts back what still equals what the apply wrote. Anything changed since is left
    as it is and reported.
  - It's refused while a newer apply on the same business stands, and it's claimed first, so two
    reverts can't both run.
  - "Had none" goes back to none: `NULL`, or `{}` for columns that can't be null.
- **Phone re-sync.** A name or tone change re-syncs the phone receptionist (apply, revert and the
  owner command).

**New done-for-you tenants.** One blueprint per industry pack can be that trade's default
(`set-default`). Provisioning a new done-for-you business applies it right after the industry
pack (`done-for-you/provision.ts`), in `tuning` mode and unattended. Unattended means sentence-like
text (policies, templates) isn't copied, and neither is anything with a placeholder the new
business can't fill. This never fails provisioning.

## Operator job

Run it with the production env, e.g. `railway run --service Everdoer -- npm run job:agent-blueprint -- …`:

```
list
save --company <companyId> --name "Snow pro" [--description "…"] [--pack <packId>]
show --name "Snow pro" [--version 2]
apply --name "Snow pro" [--version 2] --company <companyId> [--mode full|tuning]           # dry run
apply --name "Snow pro" --company <companyId> --apply                                      # write it
revert --application <applicationId>
set-default --name "Snow pro" [--version 2]
```

**Typical flow:**

1. Tune one business until it works well.
2. `save` it as a blueprint.
3. `set-default` to make it the default for that trade's new done-for-you customers.
4. For existing businesses, `apply` (dry run, then `--apply`).

## Schema

Migration `20261030100000_agent_blueprints.sql` (rollback in `supabase/rollback/`) adds:

- `companies.agent_persona`
- `agent_blueprints`
- `agent_blueprint_applications`

Both tables are service-role only (no client access). SQL test:
`scripts/sql-tests/zz_agent_blueprints.test.sql`.

## Not yet

- App screens: the profile in Settings, and a blueprint picker for owners with several brands.
- Workflows (automations) and the service catalog in blueprints. Industry packs already carry
  the trade's catalog and recipes; prices stay per business.
- Per-org blueprints made by owners (today blueprints are platform-level, made by the operator).
