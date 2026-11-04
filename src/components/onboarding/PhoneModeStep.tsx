import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Check, Copy, Loader2, MessageSquare, PhoneForwarded, PhoneIncoming } from "lucide-react";

import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/sonner";
import { useDashboardActivity } from "@/lib/api-hooks";
import { getBusinessNumber, setUpBusinessNumber, type BusinessNumberStatus } from "@/lib/api-client";
import { answeringCopy } from "@/lib/phone-modes";
import { CELL_CARRIERS, forwardingPlan, type BusinessPhoneKind, type ForwardingPlan } from "@/lib/carrier-forwarding";
import { ForwardingTestPanel } from "@/components/onboarding/ForwardingTestPanel";
import { useBrand } from "@/lib/brand-context";

/**
 * Onboarding Phone step: ONE number for everything (src/server/services/onboarding-number.ts).
 * The business gets a local number that customers can text and that its business line forwards
 * missed calls to; the AI answers those calls at the plan's level (its own quoting / booking
 * receptionist on Front Desk, the message-taking AI otherwise). Then: turn on forwarding (codes
 * for their kind of phone + carrier) and test it.
 *
 * A dedicated AI line (a separate Retell number — the old "AI receptionist" choice) stays under
 * "Advanced" for Front Desk / house accounts and anyone who already has one (`aiStep`).
 */

const input =
  "w-full px-3 py-2 text-sm bg-secondary border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/30";
const label = "text-xs font-medium text-muted-foreground mb-1.5 block";
const primaryBtn =
  "flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 active:scale-[0.97]";

export interface PhoneModeStepProps {
  orgId: string;
  companyId: string | null;
  stepData: Record<string, unknown>;
  onDone: () => void;
  /** The dedicated-AI-line setup (a separate Retell number), shown under Advanced. */
  aiStep: ReactNode;
}

export function PhoneModeStep({ orgId, companyId, stepData, onDone, aiStep }: PhoneModeStepProps) {
  const brand = useBrand();
  const qc = useQueryClient();
  const status = useQuery({
    queryKey: ["business-number", orgId, companyId],
    queryFn: () => getBusinessNumber(orgId, companyId as string),
    enabled: Boolean(orgId && companyId),
  });
  const setUp = useMutation({
    mutationFn: (body: { companyId: string; areaCode?: number; attachNumber?: string }) => setUpBusinessNumber(orgId, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["business-number", orgId] });
      void qc.invalidateQueries({ queryKey: ["missed-call-catcher", orgId] });
      void qc.invalidateQueries({ queryKey: ["onboarding", orgId] });
    },
  });
  const [areaCode, setAreaCode] = useState("");
  const [attach, setAttach] = useState("");

  const view: BusinessNumberStatus | undefined = status.data;
  const number = view?.number ?? null;
  const showDedicated = Boolean(view?.receptionistIncluded || view?.dedicatedLine || typeof stepData.agentId === "string");

  const go = async () => {
    if (!companyId) return;
    try {
      const r = await setUp.mutateAsync({
        companyId,
        ...(attach.trim() ? { attachNumber: attach.trim() } : areaCode.length === 3 ? { areaCode: Number(areaCode) } : {}),
      });
      toast.success(r.purchased ? `Your number is ${r.phoneNumberPretty}` : `${r.phoneNumberPretty} is set up`);
      if (r.receptionist === "failed") toast.error("Your quoting receptionist couldn't be set up yet — the AI takes messages meanwhile. Try again in a minute.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Setting up the number failed.");
    }
  };

  return (
    <div className="space-y-5 max-w-2xl">
      <p className="text-sm text-muted-foreground">
        Get your {brand.name} number — one local number for everything. Customers can text it, and the calls you can't pick up
        forward to it, so nothing goes to a dead voicemail. You keep your business number.
      </p>

      {view && !view.configured ? (
        <p className="text-sm text-amber-400">Phone numbers aren't available on this server yet. Contact support.</p>
      ) : null}

      {number ? (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4 space-y-2">
          <p className="text-sm font-semibold text-emerald-400">Your number</p>
          <p className="text-2xl font-bold text-foreground tabular-nums">{number.phoneNumberPretty}</p>
          <ul className="space-y-1.5 text-xs text-muted-foreground">
            <li className="flex items-start gap-2">
              <MessageSquare className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary" />{" "}
              {view?.textsOn
                ? "Customers can text it — your AI replies, and asks you before anything it can't decide."
                : "Customers can text it — the texts land in your Inbox. Turn on your AI (next step) and it replies for you."}
            </li>
            <li className="flex items-start gap-2">
              <Bot className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary" /> {answeringCopy(view?.answering ?? "message", Boolean(view?.receptionistIncluded))}
            </li>
          </ul>
        </div>
      ) : (
        <ul className="space-y-1.5 text-sm text-foreground">
          <li className="flex items-start gap-2"><MessageSquare className="w-4 h-4 mt-0.5 shrink-0 text-primary" /> Customers text it and get an answer in seconds.</li>
          <li className="flex items-start gap-2"><PhoneIncoming className="w-4 h-4 mt-0.5 shrink-0 text-primary" /> Calls you miss forward to it and the AI picks up.</li>
          <li className="flex items-start gap-2"><Check className="w-4 h-4 mt-0.5 shrink-0 text-primary" /> You get a text after every call and message.</li>
        </ul>
      )}

      {!number ? (
        <div className="space-y-3">
          <div>
            <label className={label}>Area code (optional)</label>
            <input
              className={cn(input, "w-48")}
              value={areaCode}
              onChange={(e) => setAreaCode(e.target.value.replace(/\D/g, "").slice(0, 3))}
              placeholder="Same as your business phone"
              disabled={Boolean(attach.trim())}
            />
          </div>
          <details>
            <summary className="text-xs text-muted-foreground cursor-pointer">Use a number that's already in your account instead</summary>
            <input className={cn(input, "mt-2")} value={attach} onChange={(e) => setAttach(e.target.value)} placeholder="+1 705 555 0000" />
          </details>
          <button className={primaryBtn} disabled={!companyId || setUp.isPending || view?.configured === false} onClick={() => void go()}>
            {setUp.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <PhoneForwarded className="w-4 h-4" />} Get my number
          </button>
        </div>
      ) : (
        <>
          <ForwardingSetup forwardTo={number.phoneNumber} />
          <ForwardingTestPanel orgId={orgId} companyId={companyId} onVerified={onDone} />
          <ManualTestCheck orgId={orgId} numberPretty={number.phoneNumberPretty} onDone={onDone} />
          <div className="flex flex-wrap items-center gap-4">
            <button className="text-xs font-medium text-muted-foreground hover:text-foreground" onClick={onDone}>
              Continue — I'll turn on forwarding later →
            </button>
            <button className="text-xs font-medium text-muted-foreground hover:text-foreground" disabled={setUp.isPending} onClick={() => void go()}>
              {setUp.isPending ? "Checking…" : "Re-check my number"}
            </button>
          </div>
        </>
      )}

      {showDedicated ? (
        <details className="border-t border-border pt-4">
          <summary className="text-xs text-muted-foreground cursor-pointer">Advanced: a separate AI phone line instead</summary>
          <div className="mt-3">{aiStep}</div>
        </details>
      ) : null}
    </div>
  );
}

const KINDS: Array<{ value: BusinessPhoneKind; title: string }> = [
  { value: "cell", title: "A cell phone" },
  { value: "landline", title: "A landline" },
  { value: "voip", title: "An office phone system (VoIP)" },
];

/** "Turn on forwarding": the steps for their kind of phone + carrier (lib/carrier-forwarding forwardingPlan). */
function ForwardingSetup({ forwardTo }: { forwardTo: string }) {
  const [kind, setKind] = useState<BusinessPhoneKind>("cell");
  const [carrier, setCarrier] = useState("");
  const plan: ForwardingPlan = useMemo(() => forwardingPlan({ forwardTo, kind, carrier: carrier || null }), [forwardTo, kind, carrier]);

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-3">
      <p className="text-sm font-semibold text-foreground">Turn on call forwarding (once)</p>
      <div>
        <p className={label}>The number your customers call is…</p>
        <div className="flex flex-wrap gap-2">
          {KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              aria-pressed={kind === k.value}
              onClick={() => setKind(k.value)}
              className={cn(
                "px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors",
                kind === k.value ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:bg-secondary/50",
              )}
            >
              {k.title}
            </button>
          ))}
        </div>
      </div>
      {kind === "cell" ? (
        <div>
          <label className={label}>Carrier (optional)</label>
          <select className={cn(input, "w-56")} value={carrier} onChange={(e) => setCarrier(e.target.value)}>
            <option value="">Not sure / other</option>
            {Object.entries(CELL_CARRIERS).map(([key, c]) => (
              <option key={key} value={key}>{c.label}</option>
            ))}
          </select>
        </div>
      ) : null}
      <ol className="list-decimal pl-5 space-y-1 text-sm text-foreground">
        {plan.steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      {plan.code ? (
        <div className="space-y-1">
          <CodeRow label="Dial this from your business cell" code={plan.code} telHref={plan.telHref} />
          <details>
            <summary className="text-xs text-muted-foreground cursor-pointer">If that code is rejected</summary>
            {plan.fallbackCodes.map((c) => (
              <CodeRow key={c.condition} label={c.label} code={c.activate} />
            ))}
            {plan.deactivate ? <CodeRow label="Turn forwarding off again" code={plan.deactivate} /> : null}
            <p className="text-xs text-muted-foreground mt-1">{plan.providerScript}</p>
          </details>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{plan.providerScript}</p>
      )}
    </div>
  );
}

function CodeRow({ label: text, code, telHref }: { label: string; code: string; telHref?: string | null }) {
  const copy = () => {
    void navigator.clipboard?.writeText(code).then(
      () => toast.success("Copied"),
      () => toast.error("Couldn't copy — select it instead."),
    );
  };
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-xs text-muted-foreground">{text}</span>
      <span className="flex items-center gap-2">
        {telHref ? (
          <a href={telHref} className="text-sm font-mono text-foreground bg-secondary rounded px-2 py-0.5 select-all">{code}</a>
        ) : (
          <code className="text-sm font-mono text-foreground bg-secondary rounded px-2 py-0.5 select-all">{code}</code>
        )}
        <button type="button" onClick={copy} className="text-muted-foreground hover:text-foreground" aria-label={`Copy ${code}`}>
          <Copy className="w-3.5 h-3.5" />
        </button>
      </span>
    </div>
  );
}

/** Test it yourself: call the business line from another phone and don't answer. */
function ManualTestCheck({ orgId, numberPretty, onDone }: { orgId: string; numberPretty: string; onDone: () => void }) {
  const { data: activity } = useDashboardActivity(orgId, { limit: 15 }, { refetchInterval: 6000 });
  const startedAt = useRef(Date.now());
  const caught = useMemo(
    () =>
      (activity ?? []).find(
        (e) => typeof e.eventType === "string" && e.eventType.startsWith("call.") && Date.parse(e.occurredAt) >= startedAt.current - 60_000,
      ),
    [activity],
  );
  const seen = useRef(false);
  useEffect(() => {
    if (caught && !seen.current) {
      seen.current = true;
      toast.success("Call caught — you're live!");
      onDone();
    }
  }, [caught, onDone]);

  return (
    <details className="bg-card border border-border rounded-lg p-4">
      <summary className="text-sm font-semibold text-foreground cursor-pointer">Prefer to test it yourself from another phone?</summary>
      <ol className="list-decimal pl-5 space-y-1 text-xs text-muted-foreground mt-2">
        <li>From a different phone (not your business line), call your business number.</li>
        <li>Don't answer — let it ring out.</li>
        <li>The call forwards to {numberPretty} and the AI picks up (or your greeting plays).</li>
        <li>You get a text with what the caller wanted.</li>
      </ol>
      {caught ? (
        <p className="text-sm text-emerald-400 flex items-center gap-1.5 mt-2">
          <Check className="w-4 h-4" /> Caught your call — you're live.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Waiting for your test call…
        </p>
      )}
    </details>
  );
}
