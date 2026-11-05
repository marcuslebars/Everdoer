import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Loader2, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/sonner";
import { getYourAiStep, setUpYourAiStep, type TextAutonomy } from "@/lib/api-client";
import { readinessGaps, type ReadinessItem } from "@/lib/ai-readiness";
import type { YourAiTone } from "@/lib/your-ai-api";

/**
 * Onboarding "Your AI" step (src/server/services/onboarding-ai.ts): name + tone, how much it can
 * do on its own (default: ask me first), and one button that turns texts + calls on with the
 * trade's default setup. Below it, what's still missing for it all to work, with a link to fix each.
 */

const input =
  "w-full px-3 py-2 text-sm bg-secondary border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/30";
const label = "text-xs font-medium text-muted-foreground mb-1.5 block";
const primaryBtn =
  "flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 active:scale-[0.97]";

const TONES: Array<{ value: YourAiTone; title: string }> = [
  { value: "friendly", title: "Friendly" },
  { value: "professional", title: "Professional" },
  { value: "casual", title: "Casual" },
];

const AUTONOMY: Array<{ value: TextAutonomy; title: string; blurb: string }> = [
  {
    value: "ask_first",
    title: "Ask me first (recommended)",
    blurb: "It gathers the details and answers simple questions (hours, service area). Before it gives a price, a quote or a booking time, it texts you what it wants to say and waits for your OK.",
  },
  {
    value: "standard",
    title: "On its own",
    blurb: "It quotes from your price list and books open times by itself, and asks you only for anything else — custom work, discounts, last-minute changes.",
  },
];

export function YourAiStep({ orgId, companyId, onDone, goTo }: { orgId: string; companyId: string | null; onDone: () => void; goTo: (step: ReadinessItem["step"]) => void }) {
  const qc = useQueryClient();
  const current = useQuery({
    queryKey: ["your-ai-step", orgId, companyId],
    queryFn: () => getYourAiStep(orgId, companyId as string),
    enabled: Boolean(orgId && companyId),
  });
  const save = useMutation({
    mutationFn: (body: { name: string | null; tone: YourAiTone | null; autonomy: TextAutonomy }) => setUpYourAiStep(orgId, { companyId: companyId as string, ...body }),
    onSuccess: (data) => {
      qc.setQueryData(["your-ai-step", orgId, companyId], { view: data.view, readiness: data.readiness });
      void qc.invalidateQueries({ queryKey: ["your-ai", orgId] });
      void qc.invalidateQueries({ queryKey: ["onboarding", orgId] });
    },
  });

  const [name, setName] = useState("");
  // null = the built-in tone (or whatever the trade's defaults set); only a click changes it.
  const [tone, setTone] = useState<YourAiTone | null>(null);
  const [autonomy, setAutonomy] = useState<TextAutonomy>("ask_first");
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    if (seeded || !current.data) return;
    const { persona, switches } = current.data.view;
    setName(persona.name ?? "");
    if (persona.tone) setTone(persona.tone);
    const texts = switches.find((s) => s.key === "texts");
    if (texts?.on && texts.choice === "standard") setAutonomy("standard");
    setSeeded(true);
  }, [current.data, seeded]);

  const defaultName = current.data?.view.persona.defaultName ?? "your assistant";
  // Texts / calls being off is what this step's button fixes — not a to-do here.
  const gaps = current.data ? readinessGaps(current.data.readiness).filter((g) => g.step !== "ai") : [];

  const go = async () => {
    if (!companyId) return;
    try {
      await save.mutateAsync({ name: name.trim() || null, tone, autonomy });
      toast.success(`${name.trim() || defaultName} is on`);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't turn your AI on.");
    }
  };

  return (
    <div className="space-y-5 max-w-2xl">
      <p className="text-sm text-muted-foreground">
        Your AI answers customer texts and the calls you miss, using your services, prices, hours and service area. Give it a name
        and decide how much it does on its own by text — you can change any of this later in Your AI.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={label}>Its name</label>
          <input className={input} value={name} maxLength={20} onChange={(e) => setName(e.target.value)} placeholder={defaultName} />
        </div>
        <div>
          <span className={label}>How it sounds</span>
          <div className="flex gap-2">
            {TONES.map((t) => (
              <button
                key={t.value}
                type="button"
                aria-pressed={tone === t.value}
                onClick={() => setTone(tone === t.value ? null : t.value)}
                className={cn(
                  "flex-1 px-3 py-2 rounded-lg border text-xs font-medium transition-colors",
                  tone === t.value ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:bg-secondary/50",
                )}
              >
                {t.title}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <span className={label}>When a customer texts for a price or a booking</span>
        {AUTONOMY.map((a) => (
          <button
            key={a.value}
            type="button"
            aria-pressed={autonomy === a.value}
            onClick={() => setAutonomy(a.value)}
            className={cn(
              "w-full text-left rounded-lg border p-3 transition-colors",
              autonomy === a.value ? "border-primary bg-primary/10" : "border-border hover:bg-secondary/50",
            )}
          >
            <span className="block text-sm font-semibold text-foreground">{a.title}</span>
            <span className="block text-xs text-muted-foreground mt-0.5">{a.blurb}</span>
          </button>
        ))}
      </div>

      <p className="text-xs text-muted-foreground -mt-2">
        This is for texts. On the phone it takes a message — on Front Desk it quotes from your price list and books by itself.
      </p>

      {gaps.length > 0 ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-2">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <AlertTriangle className="w-4 h-4 text-amber-400" /> To get the most out of it
          </p>
          <ul className="space-y-1.5">
            {gaps.map((g) => (
              <li key={g.key} className="flex items-start justify-between gap-3 text-xs text-muted-foreground">
                <span>{g.text}</span>
                <button type="button" className="shrink-0 font-medium text-primary hover:opacity-80" onClick={() => goTo(g.step)}>
                  Fix →
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : current.data ? (
        <p className="flex items-center gap-1.5 text-sm text-emerald-400">
          <Check className="w-4 h-4" /> Everything it needs is in place.
        </p>
      ) : null}

      {current.isError ? <p className="text-sm text-amber-400">Couldn't load your AI's settings — refresh to try again.</p> : null}
      <button className={primaryBtn} disabled={!companyId || save.isPending || !seeded} onClick={() => void go()}>
        {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Turn on my AI
      </button>
    </div>
  );
}
