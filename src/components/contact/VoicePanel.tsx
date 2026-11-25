import { useState } from "react";
import { Phone } from "lucide-react";
import { assistantCopy } from "@/lib/platform-brand";
import { useAssistantName } from "@/lib/assistant-name";
import { useBrand } from "@/lib/brand-context";

import { AiCallDialog } from "@/components/voice/AiCallDialog";

/** Minimal contact shape the call control needs (the full ContactDetail contact fits). */
export interface VoicePanelContact {
  id: string;
  name: string;
  phone: string | null;
}

/**
 * "Call with Everly": opens the call dialog, where the owner can give the AI instructions for
 * the call (or leave them empty for a quick follow-up). Nothing dials until they confirm there.
 * The contact header and the inbox both use this control.
 */
export function VoicePanel({ orgId, contact }: { orgId: string; contact: VoicePanelContact }) {
  const brand = useBrand();
  const assistantName = useAssistantName();
  const [open, setOpen] = useState(false);
  const hasPhone = Boolean(contact.phone?.trim());

  if (!hasPhone) {
    return (
      <button
        type="button"
        disabled
        title="Add a phone number to this contact to call them"
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-secondary text-muted-foreground opacity-50 cursor-not-allowed"
      >
        <Phone className="w-3 h-3" /> Call
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap bg-[hsl(var(--accent-violet))]/10 text-[hsl(var(--accent-violet))] hover:bg-[hsl(var(--accent-violet))]/20 transition-colors active:scale-[0.97]"
      >
        <Phone className="w-3 h-3" /> {assistantCopy("Call with Everly", brand, assistantName)}
      </button>
      {open && <AiCallDialog orgId={orgId} contact={contact} onClose={() => setOpen(false)} />}
    </>
  );
}
