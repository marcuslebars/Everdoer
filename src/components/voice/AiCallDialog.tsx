import { useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, Loader2, Phone, X } from "lucide-react";

import { Modal } from "@/components/ui/Modal";
import { toast } from "@/components/ui/sonner";
import type { AiCallSummary } from "@/lib/api-client";
import { useAiCallView, useCallContact, useCancelAiCall, useRequestAiCall } from "@/lib/api-hooks";
import { useAssistantName } from "@/lib/assistant-name";
import { useBrand } from "@/lib/brand-context";
import { assistantCopy } from "@/lib/platform-brand";

/**
 * "Call with Everly" on a contact (docs/sales-calls.md → "Calls with your instructions").
 * Write what the AI should do — say, ask, offer, find out — and it calls from the business's own
 * number with its tools, now or at a time you pick, then texts you how it went. Leave the box
 * empty for a plain follow-up call right now (the original one-tap call).
 */
export function AiCallDialog({
  orgId,
  contact,
  onClose,
}: {
  orgId: string;
  contact: { id: string; name: string; phone: string | null };
  onClose: () => void;
}) {
  const brand = useBrand();
  const assistantName = useAssistantName();
  const ai = (text: string) => assistantCopy(text, brand, assistantName);
  const view = useAiCallView(orgId, contact.id);
  const request = useRequestAiCall(orgId, contact.id);
  const plainCall = useCallContact(orgId, contact.id);
  const cancel = useCancelAiCall(orgId, contact.id);

  const [instructions, setInstructions] = useState("");
  const [later, setLater] = useState(false);
  const [at, setAt] = useState("");
  const [customerAsked, setCustomerAsked] = useState(false);

  const firstName = contact.name.split(" ")[0] || "them";
  const data = view.data;
  const maxChars = data?.maxChars ?? 1000;
  const hasInstructions = instructions.trim().length > 0;
  const needsConsent = hasInstructions && data ? !data.hasConsent : false;
  const pending = request.isPending || plainCall.isPending;
  const minAt = useMemo(() => toLocalInput(new Date(Date.now() + 5 * 60_000)), []);

  const blocker = !contact.phone?.trim()
    ? "Add a phone number to this contact to call them."
    : data?.doNotCall
      ? `${firstName} is on your do-not-call list.`
      : hasInstructions && data && data.availability !== "enabled"
        ? data.unavailableReason
        : null;

  const canSubmit =
    !pending &&
    !blocker &&
    instructions.length <= maxChars &&
    (!later || (hasInstructions && at.length > 0)) &&
    (!needsConsent || customerAsked) &&
    (!hasInstructions || Boolean(data));

  const submit = async () => {
    if (!canSubmit) return;
    try {
      if (!hasInstructions) {
        await plainCall.mutateAsync();
        toast.success(`${ai("Everly is calling")} ${firstName}…`);
      } else {
        const result = await request.mutateAsync({ instructions, when: later ? at.replace("T", " ") : "now", customerAsked });
        toast.success(result.message);
      }
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't place the call.");
    }
  };

  const inputCls =
    "w-full px-3 py-2 text-sm bg-secondary border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";

  return (
    <Modal onClose={onClose} size="md">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-[hsl(var(--accent-violet))]/15 flex items-center justify-center shrink-0">
            <Phone className="w-4 h-4 text-[hsl(var(--accent-violet))]" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground truncate">{ai("Call with Everly")}</h2>
            <p className="text-xs text-muted-foreground truncate">
              {contact.name || "This contact"}
              {contact.phone ? ` · ${contact.phone}` : ""}
            </p>
          </div>
        </div>
        <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground transition-colors shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-5 space-y-4">
        <div>
          <label htmlFor="ai-call-instructions" className="text-xs font-medium text-muted-foreground mb-1 block">
            {ai("What should Everly do on this call?")}
          </label>
          <textarea
            id="ai-call-instructions"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={5}
            maxLength={maxChars + 200}
            autoFocus
            placeholder={`e.g. Ask if ${firstName} still wants the spring cleanup. Mention we have Tuesday open. If they're ready, book it and send the deposit link.`}
            className={`${inputCls} resize-y min-h-[110px]`}
          />
          <div className="flex justify-between mt-1 text-[11px] text-muted-foreground/80">
            <span>{hasInstructions ? "She follows these, answers questions from your price list, and can quote and book." : "Leave empty for a quick follow-up call right now."}</span>
            <span className={instructions.length > maxChars ? "text-destructive" : ""}>
              {instructions.length}/{maxChars}
            </span>
          </div>
        </div>

        {hasInstructions && (
          <div className="flex gap-2" role="radiogroup" aria-label="When to call">
            {[
              { key: false, label: "Call now" },
              { key: true, label: "Pick a time" },
            ].map((o) => (
              <button
                key={o.label}
                type="button"
                role="radio"
                aria-checked={later === o.key}
                onClick={() => setLater(o.key)}
                className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  later === o.key ? "border-[hsl(var(--accent-violet))] bg-[hsl(var(--accent-violet))]/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        )}
        {hasInstructions && later && (
          <input type="datetime-local" value={at} min={minAt} onChange={(e) => setAt(e.target.value)} aria-label="Call time" className={inputCls} />
        )}

        {needsConsent && (
          <label className="flex items-start gap-2 text-xs text-foreground cursor-pointer">
            <input type="checkbox" checked={customerAsked} onChange={(e) => setCustomerAsked(e.target.checked)} className="mt-0.5" />
            <span>
              {firstName} asked us to call them.{" "}
              <span className="text-muted-foreground">Automated calls need their OK. We don't have it on file, so only tick this if they asked.</span>
            </span>
          </label>
        )}

        {blocker && (
          <p className="text-xs text-destructive flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" /> {blocker}
          </p>
        )}

        <p className="text-[11px] text-muted-foreground/70 flex items-start gap-1.5 leading-snug">
          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
          {hasInstructions
            ? "Calls go out weekdays 9 a.m.–9:30 p.m. and weekends 10–6 (your time). Outside those hours it waits for the next opening. You'll get a text with how it went."
            : "Rings a real phone the moment you confirm."}
        </p>

        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-secondary text-foreground hover:bg-secondary/80 transition-colors">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!canSubmit}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-[hsl(var(--accent-violet))] text-white hover:bg-[hsl(var(--accent-violet))]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.97]"
          >
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : later ? <CalendarClock className="w-4 h-4" /> : <Phone className="w-4 h-4" />}
            {later ? "Schedule call" : "Call now"}
          </button>
        </div>

        {data && data.calls.length > 0 && (
          <div className="pt-3 border-t border-border">
            <p className="text-xs font-medium text-muted-foreground mb-2">{ai("Everly's calls to")} {firstName}</p>
            <ul className="space-y-2 max-h-48 overflow-y-auto">
              {data.calls.map((c) => (
                <CallRow key={c.id} call={c} onCancel={() => cancel.mutate(c.id, { onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't cancel.") })} cancelling={cancel.isPending} />
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}

const STATUS_LABEL: Record<AiCallSummary["status"], string> = {
  scheduled: "Scheduled",
  dialing: "Calling",
  placed: "On the call",
  completed: "Done",
  failed: "Didn't connect",
  cancelled: "Cancelled",
  skipped: "Not called",
};

function CallRow({ call, onCancel, cancelling }: { call: AiCallSummary; onCancel: () => void; cancelling: boolean }) {
  const when = new Date(call.status === "scheduled" ? call.runAt : call.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return (
    <li className="rounded-lg bg-secondary/50 border border-border px-3 py-2 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-foreground">
          {STATUS_LABEL[call.status]} · {when}
          {call.reason === "speed_to_lead" ? " · new-lead call" : ""}
        </span>
        {call.status === "scheduled" && (
          <button type="button" onClick={onCancel} disabled={cancelling} aria-label="Cancel this call" className="text-muted-foreground hover:text-destructive disabled:opacity-50">
            Cancel
          </button>
        )}
      </div>
      {call.instructions && <p className="text-muted-foreground mt-1 line-clamp-2">“{call.instructions}”</p>}
      {call.result && <p className="text-foreground mt-1">{call.result}</p>}
    </li>
  );
}

/** Date → the value a datetime-local input takes (the browser's local time). PURE. */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
