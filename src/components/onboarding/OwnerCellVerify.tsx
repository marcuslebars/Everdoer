import { useState } from "react";
import { BadgeCheck, Loader2, Smartphone } from "lucide-react";

import { toast } from "@/components/ui/sonner";
import { useOwnerPhone, useOwnerPhoneActions } from "@/lib/front-desk-api";
import { prettyPhone } from "@/lib/carrier-forwarding";

const primaryBtn =
  "flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 active:scale-[0.97]";

/**
 * Onboarding: confirm the owner's cell with the 6-digit code we text to it
 * (owner-channel/owner-phone.ts — same routes as Settings → AI front desk → Owner's cell).
 * Until it's confirmed, approvals by text ("Y 12"), owner commands and the morning briefing
 * don't work, so the Business step asks for it right away instead of leaving it in Settings.
 */
export function OwnerCellVerify({ orgId, companyId, onConfirmed, onSkip }: { orgId: string; companyId: string; onConfirmed: () => void; onSkip: () => void }) {
  const { data, isLoading } = useOwnerPhone(orgId, companyId);
  const { sendCode, verify } = useOwnerPhoneActions(orgId, companyId);
  const [code, setCode] = useState("");

  if (isLoading || !data) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
      </p>
    );
  }
  if (data.verified) {
    return (
      <div className="space-y-3">
        <p className="flex items-center gap-1.5 text-sm text-emerald-400">
          <BadgeCheck className="w-4 h-4" /> {data.phone ? prettyPhone(data.phone) : "Your cell"} is confirmed.
        </p>
        <button className={primaryBtn} onClick={onConfirmed}>Continue</button>
      </div>
    );
  }

  // A code still pending for a DIFFERENT number (the cell was changed since) isn't this one: confirming
  // it would make that old number the owner's cell. Only the saved cell is confirmed here.
  const pendingForSaved = Boolean(data.pendingPhone && data.phone && data.pendingPhone === data.phone);
  const target = data.phone;
  const send = () =>
    target &&
    sendCode.mutate(target, {
      onSuccess: () => toast.success("Code sent"),
      onError: (err) => toast.error(err instanceof Error ? err.message : "Couldn't send the code"),
    });
  const confirm = () =>
    verify.mutate(code.trim(), {
      onSuccess: (view) => {
        if (view.verified) {
          toast.success("Your cell is confirmed");
          onConfirmed();
        }
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : "That code didn't work"),
    });

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-3">
      <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Smartphone className="w-4 h-4 text-primary" /> Confirm your cell
      </p>
      <p className="text-xs text-muted-foreground">
        Your AI texts you here when it needs an OK, and you can run things by text (“move Jamie to Friday”). Only a confirmed
        number can do that.
      </p>
      {!target ? (
        <p className="text-sm text-amber-400">Add your cell above first.</p>
      ) : !pendingForSaved ? (
        <button className={primaryBtn} disabled={sendCode.isPending} onClick={send}>
          {sendCode.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Text a code to {prettyPhone(target)}
        </button>
      ) : (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            confirm();
          }}
        >
          <span className="w-full text-xs text-muted-foreground">We texted a 6-digit code to {prettyPhone(target)}.</span>
          <input
            className="h-9 w-32 rounded-md border border-border bg-background px-3 text-sm tracking-widest"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            aria-label="Code"
          />
          <button type="submit" className={primaryBtn} disabled={verify.isPending || code.trim().length !== 6}>
            {verify.isPending ? "Checking…" : "Confirm"}
          </button>
          <button type="button" className="text-xs text-muted-foreground underline" disabled={sendCode.isPending} onClick={send}>
            Send again
          </button>
        </form>
      )}
      <button className="text-xs font-medium text-muted-foreground hover:text-foreground" onClick={onSkip}>
        Skip for now — I'll confirm it later →
      </button>
    </div>
  );
}
