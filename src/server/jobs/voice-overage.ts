/**
 * Voice overage — the billing pass, and a preview. See docs/billing.md → "Voice overage".
 *
 * The daily cron service (railway.voice-overage.json, `-- --run`) bills the month that just
 * closed, once, when VOICE_OVERAGE_BILLING is set. It's a cron of its own because it needs
 * STRIPE_SECRET_KEY, which the workflow worker deliberately doesn't carry. Without flags it
 * only prints what would be billed.
 *
 * SANCTIONED EXCEPTION (service role) — jobs. Cross-tenant, operator-only; no request input.
 * Delegates to services/billing/voice-overage.ts. Needs NEXT_PUBLIC_SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY; --run in charge mode also STRIPE_SECRET_KEY + STRIPE_PRICE_VOICE_OVERAGE.
 *
 * PowerShell (note the `--` before the flags):
 *   npm run job:voice-overage                          # print last month's overage (nothing written)
 *   npm run job:voice-overage -- --month 2026-09       # …for a given month
 *   npm run job:voice-overage -- --run                 # run the pass now (what the cron runs)
 *
 * Exit code 1 when any org failed (retried on the next run, up to 3 tries).
 */
import { closedMonth, computeVoiceOverages, processVoiceOverage } from "@/server/services/billing/voice-overage";
import { torontoMonthStart } from "@/server/services/usage";
import { createSupabaseAdminClient } from "@/server/supabase/admin";

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const admin = createSupabaseAdminClient();
  if (args.includes("--run")) {
    const r = await processVoiceOverage(admin, Date.now());
    console.log(`[voice-overage] ${r.month} (${r.mode}): over=${r.over} recorded=${r.recorded} charged=${r.charged} skipped=${r.skipped} failed=${r.failed}`);
    return r.failed > 0 ? 1 : 0;
  }
  const i = args.indexOf("--month");
  const month = i >= 0 && args[i + 1] ? torontoMonthStart(args[i + 1]) : closedMonth(Date.now());
  const overages = await computeVoiceOverages(admin, month);
  for (const o of overages) {
    console.log(`${o.organizationId}  ${o.scope.padEnd(12)}  used ${o.usedMinutes} of ${o.includedMinutes}  → bill ${o.overageMinutes} min  ${o.stripeCustomerId ?? "(no Stripe customer)"}`);
  }
  console.log(`\n[voice-overage] ${month}: ${overages.length} org(s) over (preview — nothing written)`);
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error("[voice-overage] FAILED:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
