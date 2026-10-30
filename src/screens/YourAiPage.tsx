/**
 * Your AI (docs/your-ai.md): what the assistant does for you, as plain switches, plus its name and
 * tone. Each switch is the same setting as in Settings → AI front desk; "Customize" goes there for
 * the details (timings, wording, hours).
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bot, ChevronRight, Loader2 } from "lucide-react";
import { useOrg } from "@/lib/org-context";
import { useAuth } from "@/lib/auth-context";
import { useCompanies } from "@/lib/api-hooks";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/sonner";
import { ErrorBanner } from "@/components/ui/StateViews";
import { YOUR_AI_GROUPS, useUpdateYourAi, useYourAi, type YourAiSwitch, type YourAiTone, type YourAiView } from "@/lib/your-ai-api";

const TONES: Array<{ value: YourAiTone; label: string }> = [
  { value: "friendly", label: "Friendly" },
  { value: "professional", label: "Professional" },
  { value: "casual", label: "Casual" },
];

function SwitchRow({ item, canManage, busy, onChange }: { item: YourAiSwitch; canManage: boolean; busy: boolean; onChange: (on: boolean, choice?: string) => void }) {
  const id = `your-ai-${item.key}`;
  return (
    <li className="py-3.5 flex items-start gap-4" data-testid={id}>
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="text-sm font-medium text-foreground cursor-pointer">
          {item.label}
        </label>
        <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
        {item.needs && <p className="text-xs text-warning mt-1">{item.needs}</p>}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          {item.on && item.choices && (
            <div role="radiogroup" aria-label={`${item.label}: how`} className="flex items-center gap-1 rounded-md bg-secondary p-0.5">
              {item.choices.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  role="radio"
                  aria-checked={item.choice === c.value}
                  disabled={!canManage || busy}
                  onClick={() => item.choice !== c.value && onChange(true, c.value)}
                  className={cn(
                    "px-2 py-0.5 rounded text-xs font-medium transition-colors disabled:cursor-not-allowed",
                    item.choice === c.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}
          {item.customize && (
            <Link to={item.customize} className="inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline">
              Customize <ChevronRight className="w-3 h-3" />
            </Link>
          )}
        </div>
      </div>
      <Switch id={id} checked={item.on} disabled={!canManage || busy} onCheckedChange={(on) => onChange(on)} aria-label={item.label} />
    </li>
  );
}

function PersonaCard({ view, canManage, busy, onSave }: { view: YourAiView; canManage: boolean; busy: boolean; onSave: (name: string | null, tone: YourAiTone | null) => void }) {
  const [name, setName] = useState(view.persona.name ?? "");
  useEffect(() => setName(view.persona.name ?? ""), [view.persona.name]);
  const trimmed = name.trim();
  const nameChanged = trimmed !== (view.persona.name ?? "");

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/15 text-primary shrink-0">
          <Bot className="w-5 h-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">Your assistant</h2>
          <p className="text-xs text-muted-foreground">The name it uses with customers, and how it sounds.</p>
        </div>
      </div>
      <form
        className="mt-4 grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (nameChanged) onSave(trimmed || null, view.persona.tone);
        }}
      >
        <div>
          <label htmlFor="your-ai-name" className="text-xs font-medium text-muted-foreground">
            Name
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id="your-ai-name"
              value={name}
              maxLength={20}
              disabled={!canManage || busy}
              placeholder={view.persona.defaultName}
              onChange={(e) => setName(e.target.value)}
              className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {nameChanged && (
              <button type="submit" disabled={!canManage || busy} className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                Save
              </button>
            )}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">Leave empty to use “{view.persona.defaultName}” on the phone.</p>
        </div>
        <div>
          <span id="your-ai-tone" className="text-xs font-medium text-muted-foreground">
            Tone
          </span>
          <div role="radiogroup" aria-labelledby="your-ai-tone" className="mt-1 flex items-center gap-1 rounded-md bg-secondary p-1 w-fit">
            {TONES.map((t) => {
              const selected = (view.persona.tone ?? "friendly") === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={!canManage || busy}
                  onClick={() => !selected && onSave(view.persona.name, t.value)}
                  className={cn(
                    "px-3 py-1 rounded text-sm font-medium transition-colors disabled:cursor-not-allowed",
                    selected ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </form>
    </section>
  );
}

export default function YourAiPage() {
  const { organizationId, companyId } = useOrg();
  const { session } = useAuth();
  const role = session?.organizations.find((o) => o.id === organizationId)?.membershipRole ?? "member";
  const canManage = role === "owner" || role === "admin";
  const { data: companies } = useCompanies(organizationId);
  const effectiveCompanyId = companyId ?? companies?.[0]?.id ?? null;
  const companyName = companies?.find((c) => c.id === effectiveCompanyId)?.name;
  const { data, isLoading, isError, refetch } = useYourAi(organizationId, effectiveCompanyId);
  const update = useUpdateYourAi(organizationId, effectiveCompanyId);
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const flip = (item: YourAiSwitch, on: boolean, choice?: string) => {
    setPendingKey(item.key);
    update.mutate(
      { switch: item.key, on, ...(choice ? { choice } : {}) },
      {
        onSuccess: () => toast.success(on ? `${item.label}: on` : `${item.label}: off`),
        onError: (err) => toast.error(err instanceof Error ? err.message : "Couldn't save that. Try again."),
        onSettled: () => setPendingKey(null),
      },
    );
  };

  const savePersona = (name: string | null, tone: YourAiTone | null) => {
    setPendingKey("persona");
    update.mutate(
      { persona: { name, tone } },
      {
        onSuccess: () => toast.success("Saved"),
        onError: (err) => toast.error(err instanceof Error ? err.message : "Couldn't save that. Try again."),
        onSettled: () => setPendingKey(null),
      },
    );
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Your AI</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          What your assistant does for you{companies && companies.length > 1 && companyName ? ` at ${companyName}` : ""}. Switch anything off and it stops.
        </p>
        {!canManage && <p className="text-xs text-muted-foreground mt-1">Only owners and admins can change these.</p>}
      </header>

      {isError ? (
        <ErrorBanner message="Couldn't load your AI's settings." onRetry={() => refetch()} />
      ) : isLoading || !data ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : (
        <>
          <PersonaCard view={data} canManage={canManage} busy={pendingKey === "persona"} onSave={savePersona} />
          {YOUR_AI_GROUPS.map((group) => {
            const items = data.switches.filter((s) => s.group === group.id);
            if (items.length === 0) return null;
            return (
              <section key={group.id} className="rounded-xl border border-border bg-card px-5 py-2 shadow-sm">
                <h2 className="pt-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">{group.title}</h2>
                <ul className="divide-y divide-border">
                  {items.map((item) => (
                    <SwitchRow key={item.key} item={item} canManage={canManage} busy={pendingKey === item.key} onChange={(on, choice) => flip(item, on, choice)} />
                  ))}
                </ul>
              </section>
            );
          })}
          <p className="text-center text-xs text-muted-foreground pb-2">
            Everything else your AI can do is in{" "}
            <Link to="/settings?section=front-desk" className="text-primary hover:underline">
              Settings → AI front desk
            </Link>
            .
          </p>
        </>
      )}
    </div>
  );
}
