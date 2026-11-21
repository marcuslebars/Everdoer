/**
 * Settings → Your website: the owner's say over what the page shows — section order and
 * visibility, each service's one-liner, the questions, and the "How it works" steps. Each card
 * saves on its own; sections save on tap. Clearing back to ours is always one click.
 */
import { useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ExternalLink, Plus, Trash2 } from "lucide-react";

import { toast } from "@/components/ui/sonner";
import { Switch } from "@/components/ui/switch";
import { resolveApiUrl } from "@/lib/api-client";
import type { SiteEditInput, SiteFaq, SiteStep, SiteView } from "@/lib/site-api";
import { cn } from "@/lib/utils";

const inputCls =
  "w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 disabled:opacity-60";
const hintCls = "text-xs text-muted-foreground mt-1";
const MAX_FAQS = 8;

type Site = NonNullable<SiteView["site"]>;
type Save = (body: SiteEditInput, done: string) => Promise<boolean>;

interface EditorProps {
  site: Site;
  save: Save;
  disabled: boolean;
}

function Card({ title, hint, badge, defaultOpen = false, children }: { title: string; hint: string; badge?: string; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-border">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="w-full flex items-start justify-between gap-3 p-4 text-left">
        <span>
          <span className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{title}</span>
            {badge && <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[11px] font-medium">{badge}</span>}
          </span>
          <span className={cn(hintCls, "block")}>{hint}</span>
        </span>
        <ChevronDown className={cn("w-4 h-4 mt-0.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </div>
  );
}

function Actions({ dirty, busy, onSave, onDiscard, extra }: { dirty: boolean; busy: boolean; onSave: () => void; onDiscard: () => void; extra?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 pt-1">
      <button type="button" onClick={onSave} disabled={!dirty || busy} className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
        Save
      </button>
      {dirty && (
        <button type="button" onClick={onDiscard} className="text-sm text-muted-foreground hover:text-foreground">
          Discard changes
        </button>
      )}
      {extra}
    </div>
  );
}

// ── Sections ────────────────────────────────────────────────────────────────

export function SiteSectionsCard({ site, save, disabled }: EditorProps) {
  const sections = site.sections;
  const write = (next: typeof sections, done: string) => void save({ sections: next.map(({ id, hidden }) => ({ id, hidden })) }, done);
  const move = (index: number, by: -1 | 1) => {
    const next = [...sections];
    const [item] = next.splice(index, 1);
    next.splice(index + by, 0, item);
    write(next, "Order saved");
  };
  const toggle = (index: number, shown: boolean) => write(sections.map((s, i) => (i === index ? { ...s, hidden: !shown } : s)), shown ? "Section shown" : "Section hidden");

  return (
    <Card title="Sections" hint="Choose what's on the page and in what order. The top of the page and the quote form stay put." defaultOpen>
      <ol className="space-y-1.5">
        {sections.map((s, i) => (
          <li key={s.id} className={cn("flex items-center gap-2 rounded-lg border border-border px-3 py-2", s.hidden && "opacity-60")}>
            <div className="flex flex-col">
              <button type="button" onClick={() => move(i, -1)} disabled={disabled || i === 0} aria-label={`Move ${s.label} up`} className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-30">
                <ArrowUp className="w-3.5 h-3.5" />
              </button>
              <button type="button" onClick={() => move(i, 1)} disabled={disabled || i === sections.length - 1} aria-label={`Move ${s.label} down`} className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-30">
                <ArrowDown className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-foreground">{s.label}</p>
              {!s.available && <p className="text-xs text-muted-foreground">Nothing to show yet, so it stays off the page.</p>}
            </div>
            <Switch checked={!s.hidden} onCheckedChange={(v) => toggle(i, v)} disabled={disabled} aria-label={`Show ${s.label}`} />
          </li>
        ))}
      </ol>
    </Card>
  );
}

// ── Service lines ───────────────────────────────────────────────────────────

export function SiteServiceLinesCard({ site, save, disabled }: EditorProps) {
  const initial = Object.fromEntries(site.services.map((s) => [s.key, s.blurb]));
  const [draft, setDraft] = useState<Record<string, string>>(initial);
  const dirty = site.services.some((s) => (draft[s.key] ?? "") !== s.blurb);
  if (site.services.length === 0) return null;

  const onSave = () => {
    const body: Record<string, string | null> = {};
    for (const s of site.services) {
      const v = (draft[s.key] ?? "").trim();
      if (v === s.blurb) continue;
      // Matching our line (or empty) means "use ours", so it follows later rebuilds.
      body[s.key] = !v || v === s.generated ? null : v;
    }
    void save({ serviceBlurbs: body }, "Service descriptions saved");
  };

  const editedCount = site.services.filter((s) => s.edited).length;
  return (
    <Card title="Service descriptions" hint="The short line under each service." badge={editedCount ? `${editedCount} in your words` : undefined}>
      {site.services.map((s) => (
        <div key={s.key}>
          <div className="flex items-center justify-between gap-2 mb-1">
            <label htmlFor={`blurb-${s.key}`} className="text-sm font-medium text-foreground">
              {s.label}
            </label>
            {s.edited && (
              <button type="button" onClick={() => setDraft((d) => ({ ...d, [s.key]: s.generated }))} disabled={disabled} className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2">
                Use ours
              </button>
            )}
          </div>
          <input
            id={`blurb-${s.key}`}
            value={draft[s.key] ?? ""}
            maxLength={200}
            placeholder={s.generated || "One line about this service"}
            onChange={(e) => setDraft((d) => ({ ...d, [s.key]: e.target.value }))}
            disabled={disabled}
            className={inputCls}
          />
        </div>
      ))}
      <p className={hintCls}>Clear a box to go back to our line.</p>
      <Actions dirty={dirty} busy={disabled} onSave={onSave} onDiscard={() => setDraft(initial)} />
    </Card>
  );
}

// ── Questions ───────────────────────────────────────────────────────────────

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function SiteQuestionsCard({ site, save, disabled }: EditorProps) {
  const [draft, setDraft] = useState<SiteFaq[]>(site.faqs);
  const dirty = !same(draft, site.faqs);
  const update = (i: number, patch: Partial<SiteFaq>) => setDraft((d) => d.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const incomplete = draft.some((q) => !q.question.trim() || !q.answer.trim());

  const onSave = () => {
    if (incomplete) {
      toast.error("Each question needs a question and an answer.");
      return;
    }
    const cleaned = draft.map((q) => ({ question: q.question.trim(), answer: q.answer.trim() }));
    void save({ faqs: same(cleaned, site.generatedFaqs) ? null : cleaned }, "Questions saved");
  };

  return (
    <Card title="Questions" hint="The questions and answers near the bottom of the page." badge={site.faqsEdited ? "In your words" : undefined}>
      {draft.length === 0 && <p className="text-sm text-muted-foreground">No questions. The section won't show.</p>}
      {draft.map((q, i) => (
        <div key={i} className="rounded-lg border border-border p-3 space-y-2">
          <div className="flex items-start gap-2">
            <input
              value={q.question}
              maxLength={140}
              placeholder="Question"
              aria-label={`Question ${i + 1}`}
              onChange={(e) => update(i, { question: e.target.value })}
              disabled={disabled}
              className={cn(inputCls, "font-medium")}
            />
            <div className="flex shrink-0">
              <button type="button" onClick={() => setDraft((d) => swap(d, i, i - 1))} disabled={disabled || i === 0} aria-label="Move question up" className="p-2 rounded text-muted-foreground hover:text-foreground disabled:opacity-30">
                <ArrowUp className="w-3.5 h-3.5" />
              </button>
              <button type="button" onClick={() => setDraft((d) => swap(d, i, i + 1))} disabled={disabled || i === draft.length - 1} aria-label="Move question down" className="p-2 rounded text-muted-foreground hover:text-foreground disabled:opacity-30">
                <ArrowDown className="w-3.5 h-3.5" />
              </button>
              <button type="button" onClick={() => setDraft((d) => d.filter((_, j) => j !== i))} disabled={disabled} aria-label="Remove question" className="p-2 rounded text-muted-foreground hover:text-destructive">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <textarea
            value={q.answer}
            rows={2}
            maxLength={600}
            placeholder="Answer"
            aria-label={`Answer ${i + 1}`}
            onChange={(e) => update(i, { answer: e.target.value })}
            disabled={disabled}
            className={cn(inputCls, "resize-y")}
          />
        </div>
      ))}
      <Actions
        dirty={dirty}
        busy={disabled}
        onSave={onSave}
        onDiscard={() => setDraft(site.faqs)}
        extra={
          <>
            {draft.length < MAX_FAQS && (
              <button type="button" onClick={() => setDraft((d) => [...d, { question: "", answer: "" }])} disabled={disabled} className="inline-flex items-center gap-1 text-sm text-foreground hover:underline">
                <Plus className="w-3.5 h-3.5" /> Add a question
              </button>
            )}
            {site.faqsEdited && (
              <button type="button" onClick={() => void save({ faqs: null }, "Back to our questions")} disabled={disabled} className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2">
                Use ours
              </button>
            )}
          </>
        }
      />
    </Card>
  );
}

function swap<T>(list: T[], a: number, b: number): T[] {
  if (b < 0 || b >= list.length) return list;
  const next = [...list];
  [next[a], next[b]] = [next[b], next[a]];
  return next;
}

// ── How it works ────────────────────────────────────────────────────────────

export function SiteStepsCard({ site, save, disabled }: EditorProps) {
  const [draft, setDraft] = useState<SiteStep[]>(site.steps);
  const dirty = !same(draft, site.steps);
  if (site.mode === "price_page") return null;
  const update = (i: number, patch: Partial<SiteStep>) => setDraft((d) => d.map((st, j) => (j === i ? { ...st, ...patch } : st)));

  const onSave = () => {
    if (draft.some((st) => !st.title.trim() || !st.text.trim())) {
      toast.error("Each step needs a title and a line of text.");
      return;
    }
    const cleaned = draft.map((st) => ({ title: st.title.trim(), text: st.text.trim() }));
    void save({ steps: same(cleaned, site.generatedSteps) ? null : cleaned }, "Steps saved");
  };

  return (
    <Card title="How it works" hint="Two to four short steps from first call to finished job." badge={site.stepsEdited ? "In your words" : undefined}>
      {draft.map((st, i) => (
        <div key={i} className="flex items-start gap-2">
          <span className="mt-2 w-5 shrink-0 text-sm font-semibold text-muted-foreground">{i + 1}.</span>
          <div className="flex-1 space-y-1.5">
            <input value={st.title} maxLength={60} placeholder="Step title" aria-label={`Step ${i + 1} title`} onChange={(e) => update(i, { title: e.target.value })} disabled={disabled} className={cn(inputCls, "font-medium")} />
            <input value={st.text} maxLength={200} placeholder="One line about this step" aria-label={`Step ${i + 1} text`} onChange={(e) => update(i, { text: e.target.value })} disabled={disabled} className={inputCls} />
          </div>
          <button type="button" onClick={() => setDraft((d) => d.filter((_, j) => j !== i))} disabled={disabled || draft.length <= 2} aria-label="Remove step" className="mt-1 p-2 rounded text-muted-foreground hover:text-destructive disabled:opacity-30">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <Actions
        dirty={dirty}
        busy={disabled}
        onSave={onSave}
        onDiscard={() => setDraft(site.steps)}
        extra={
          <>
            {draft.length < 4 && (
              <button type="button" onClick={() => setDraft((d) => [...d, { title: "", text: "" }])} disabled={disabled} className="inline-flex items-center gap-1 text-sm text-foreground hover:underline">
                <Plus className="w-3.5 h-3.5" /> Add a step
              </button>
            )}
            {site.stepsEdited && (
              <button type="button" onClick={() => void save({ steps: null }, "Back to our steps")} disabled={disabled} className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2">
                Use ours
              </button>
            )}
          </>
        }
      />
    </Card>
  );
}

// ── Rebuild with a note ─────────────────────────────────────────────────────

export const NOTE_MAX = 400;

export function SiteRebuildNote({
  savedNote,
  disabled,
  pending,
  onRebuild,
}: {
  savedNote: string | null;
  disabled: boolean;
  pending: boolean;
  onRebuild: (note: string | null) => void;
}) {
  const [note, setNote] = useState(savedNote ?? "");
  const trimmed = note.trim();
  return (
    <div className="rounded-lg bg-secondary/60 p-3 space-y-2">
      <label htmlFor="site-note" className="text-sm font-medium text-foreground">
        Rewrite with a note
      </label>
      <textarea
        id="site-note"
        rows={2}
        maxLength={NOTE_MAX}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={'e.g. "Make it friendlier", "Mention we do 24/7 emergency calls", "We mostly work on cottages"'}
        disabled={disabled}
        className={cn(inputCls, "resize-y bg-background")}
      />
      <p className={hintCls}>
        We rewrite the page with your note and keep it for future rebuilds. Anything you tell us about your business here can go on the page. Boxes you've
        written yourself stay as they are.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => onRebuild(trimmed ? trimmed : null)}
          disabled={disabled || (!trimmed && !savedNote)}
          className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
        >
          {pending ? "Rewriting…" : "Rewrite the page"}
        </button>
        {savedNote && !trimmed && <span className="text-xs text-muted-foreground">This clears your saved note.</span>}
      </div>
    </div>
  );
}

// ── Service and town pages ──────────────────────────────────────────────────

const MAX_TOWNS = 6;

function splitTowns(text: string): string[] {
  return text
    .split(/,|\n/)
    .map((t) => t.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

export function SitePagesCard({ site, save, disabled }: EditorProps) {
  const pages = site.pages;
  const [towns, setTowns] = useState((pages?.towns ?? pages?.areaTowns ?? []).join(", "));
  if (!pages) return null;
  if (!pages.enabled) {
    return (
      <Card title="Service and town pages" hint="Extra pages that help people find you on Google.">
        <p className="text-sm text-muted-foreground">
          These are for full websites. Your page is a services and prices page that links back to your own website, so it stays a single page.
        </p>
      </Card>
    );
  }

  const current = pages.towns ?? pages.areaTowns;
  const typed = splitTowns(towns);
  const townsDirty = typed.join("|").toLowerCase() !== current.join("|").toLowerCase();
  const serviceCount = pages.list.filter((p) => p.kind === "service").length;
  const areaCount = pages.list.filter((p) => p.kind === "area").length;

  const saveTowns = () => {
    if (typed.length > MAX_TOWNS) {
      toast.error(`Pick up to ${MAX_TOWNS} towns.`);
      return;
    }
    if (typed.some((t) => t.length < 2 || t.length > 40)) {
      toast.error("Each town needs 2 to 40 letters.");
      return;
    }
    void save({ pages: { towns: typed } }, "Towns saved");
  };

  return (
    <Card
      title="Service and town pages"
      hint="A page for each service and each town you work in, so people searching for them on Google can find you."
      badge={pages.list.length ? `${pages.list.length} page${pages.list.length === 1 ? "" : "s"}` : undefined}
    >
      <div className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
        <div>
          <p className="text-sm font-medium text-foreground">A page for each service</p>
          <p className={hintCls}>{pages.services ? `${serviceCount} service page${serviceCount === 1 ? "" : "s"}, with the price and a quote form.` : "Off."}</p>
        </div>
        <Switch checked={pages.services} onCheckedChange={(v) => void save({ pages: { services: v } }, v ? "Service pages on" : "Service pages off")} disabled={disabled} aria-label="A page for each service" />
      </div>
      <div className="rounded-lg border border-border p-3 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">A page for each town</p>
            <p className={hintCls}>
              {!pages.areas
                ? "Off."
                : areaCount
                  ? `${areaCount} town page${areaCount === 1 ? "" : "s"}.`
                  : "Add at least two towns to get town pages. With one town, your main page already covers it."}
            </p>
          </div>
          <Switch checked={pages.areas} onCheckedChange={(v) => void save({ pages: { areas: v } }, v ? "Town pages on" : "Town pages off")} disabled={disabled} aria-label="A page for each town" />
        </div>
        {pages.areas && (
          <div>
            <label htmlFor="site-towns" className="text-sm font-medium text-foreground">
              Towns
            </label>
            <input
              id="site-towns"
              value={towns}
              onChange={(e) => setTowns(e.target.value)}
              placeholder="Midland, Penetanguishene, Tiny"
              disabled={disabled}
              className={cn(inputCls, "mt-1.5")}
            />
            <p className={hintCls}>
              Up to {MAX_TOWNS}, separated by commas. Only list towns you really work in.
              {pages.towns === null && pages.areaTowns.length > 0 && " We filled these in from your service area."}
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button type="button" onClick={saveTowns} disabled={!townsDirty || disabled} className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
                Save towns
              </button>
              {pages.towns !== null && (
                <button type="button" onClick={() => void save({ pages: { towns: null } }, "Using your service area")} disabled={disabled} className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2">
                  Use my service area
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      {pages.list.length > 0 && (
        <ul className="space-y-1">
          {pages.list.map((p) => (
            <li key={p.url} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate text-foreground">{p.label}</span>
              <a href={resolveApiUrl(p.previewUrl)} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <ExternalLink className="w-3 h-3" /> Preview
              </a>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
