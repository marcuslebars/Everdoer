/**
 * Set up Everdoer's own "Have Everly call me now" line (docs/sales-calls.md → Everdoer's own
 * callback; services/sales-calls/everdoer-callback-setup.ts does the work).
 *
 *   npm run job:everdoer-callback-setup              # say what it would do (dry run, the default)
 *   npm run job:everdoer-callback-setup -- --apply   # do it (buys ONE Retell number, ~US$2/month)
 *
 * Needs the service-role Supabase env, and for --apply RETELL_API_KEY, RETELL_FUNCTION_SECRET and
 * APP_BASE_URL (the inbound receptionist's tools). Re-runnable: it only fills what's missing.
 *
 * Afterwards set EVERDOER_CALLBACK_COMPANY_ID (printed) on the web AND worker services, and put
 * the printed form key in everdoer.com's VITE_CALLBACK_FORM_KEY.
 */
import { provisionPhoneForCompany } from "@/server/services/onboarding-provision";
import { runEverdoerCallbackSetup } from "@/server/services/sales-calls/everdoer-callback-setup";
import { createSupabaseAdminClient } from "@/server/supabase/admin";

async function main(): Promise<number> {
  const apply = process.argv.includes("--apply");
  const admin = createSupabaseAdminClient();
  // Ids Retell already created survive a failed area code, so the next try reuses them.
  const existing: { llmId?: string | null; agentId?: string | null; phoneNumber?: string | null } = {};
  const report = await runEverdoerCallbackSetup(admin, { apply }, {
    provisionPhone: async (context, input) => {
      const result = await provisionPhoneForCompany(context, {
        companyId: input.companyId,
        areaCode: input.areaCode,
        existing: { llmId: existing.llmId ?? null, agentId: existing.agentId ?? null },
        onCreated: async (ids) => {
          Object.assign(existing, ids);
          console.log(`[everdoer-callback-setup] retell created ${JSON.stringify(ids)}`);
        },
      });
      return { phoneNumber: result.phoneNumber, agentId: result.agentId };
    },
  });
  for (const line of report.steps) console.log(`[everdoer-callback-setup] ${line}`);
  console.log("");
  if (report.companyId) console.log(`EVERDOER_CALLBACK_COMPANY_ID=${report.companyId}`);
  if (report.formKey) console.log(`VITE_CALLBACK_FORM_KEY=${report.formKey}`);
  if (report.phoneNumber) console.log(`Everly's number: ${report.phoneNumber}`);
  if (!apply) console.log("\n(dry run — pass --apply to make these changes)");
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error("[everdoer-callback-setup] FAILED:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
