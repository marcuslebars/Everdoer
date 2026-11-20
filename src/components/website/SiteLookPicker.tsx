import { Check, Sparkles } from "lucide-react";

import {
  SITE_COLOR_SWATCHES,
  SITE_THEME_OPTIONS,
  siteThemeLabel,
  type SiteStyle,
  type SiteThemeChoice,
  type SiteThemeId,
} from "@/lib/site-style";
import { cn } from "@/lib/utils";

/**
 * The website look picker (docs/done-for-you.md → "Generated sites" → "Looks"): used by the quick
 * setup page before the page is built and by Settings → Your website after. Controlled: the
 * parent saves. Every option is a real radio button (keyboard and screen readers work).
 */
export function SiteLookPicker({
  value,
  autoTheme,
  onChange,
  disabled = false,
  size = "md",
}: {
  value: SiteStyle;
  autoTheme: SiteThemeId;
  onChange: (next: SiteStyle) => void;
  disabled?: boolean;
  /** "lg" = the setup page's big touch targets. */
  size?: "md" | "lg";
}) {
  const shown: SiteThemeId = value.theme === "auto" ? autoTheme : value.theme;
  const color = value.color;
  return (
    <div className="space-y-5" data-testid="site-look-picker">
      <div>
        <p id="site-look-label" className={cn("font-medium text-foreground", size === "lg" ? "text-base" : "text-sm")}>
          Look
        </p>
        <div role="radiogroup" aria-labelledby="site-look-label" className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {SITE_THEME_OPTIONS.map((opt) => {
            const selected = value.theme === opt.id;
            const previewTheme: SiteThemeId = opt.id === "auto" ? autoTheme : opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={disabled}
                onClick={() => onChange({ ...value, theme: opt.id as SiteThemeChoice })}
                className={cn(
                  "group flex flex-col overflow-hidden rounded-xl border text-left transition-colors disabled:opacity-60",
                  selected ? "border-primary ring-2 ring-primary/40" : "border-border hover:border-foreground/30",
                )}
              >
                <LookThumb look={previewTheme} color={color} auto={opt.id === "auto"} />
                <span className="flex flex-col gap-0.5 p-2.5">
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    {opt.id === "auto" ? <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden="true" /> : null}
                    {opt.label}
                    {selected ? <Check className="ml-auto h-4 w-4 text-primary" aria-hidden="true" /> : null}
                  </span>
                  <span className="text-xs leading-snug text-muted-foreground">
                    {opt.id === "auto" ? `${opt.description} For you: ${siteThemeLabel(autoTheme)}.` : opt.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p id="site-color-label" className={cn("font-medium text-foreground", size === "lg" ? "text-base" : "text-sm")}>
          Main colour
        </p>
        <div role="radiogroup" aria-labelledby="site-color-label" className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            role="radio"
            aria-checked={color === null}
            disabled={disabled}
            onClick={() => onChange({ ...value, color: null })}
            className={cn(
              "inline-flex min-h-[44px] items-center gap-2 rounded-full border px-3 text-sm font-medium disabled:opacity-60",
              color === null ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {color === null ? <Check className="h-4 w-4 text-primary" aria-hidden="true" /> : null}
            My brand colours
          </button>
          {SITE_COLOR_SWATCHES.map((hex) => (
            <button
              key={hex}
              type="button"
              role="radio"
              aria-checked={color === hex}
              aria-label={`Colour ${hex}`}
              disabled={disabled}
              onClick={() => onChange({ ...value, color: hex })}
              className={cn(
                "flex h-11 w-11 items-center justify-center rounded-full border-2 transition-transform disabled:opacity-60",
                color === hex ? "border-foreground scale-105" : "border-transparent hover:scale-105",
              )}
              style={{ backgroundColor: hex }}
            >
              {color === hex ? <Check className="h-4 w-4 text-white" aria-hidden="true" /> : null}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {color === null ? "We use the colours from your logo or brand settings, or a colour that suits your trade." : `Shown in the ${siteThemeLabel(shown)} look.`}
        </p>
      </div>
    </div>
  );
}

/** A small drawing of each look (not a screenshot), tinted with the chosen colour. */
function LookThumb({ look, color, auto }: { look: SiteThemeId; color: string | null; auto: boolean }) {
  const c = color ?? (look === "bold" ? "#13283b" : look === "clean" ? "#1d4ed8" : "#1f3a2e");
  if (look === "bold") {
    return (
      <span aria-hidden="true" className={cn("relative block h-20 w-full", auto && "opacity-90")} style={{ backgroundColor: c }}>
        <span className="absolute left-2.5 top-3 block h-2 w-16 rounded-sm bg-white/90" />
        <span className="absolute left-2.5 top-6 block h-2 w-12 rounded-sm" style={{ backgroundColor: "#ff8a3d" }} />
        <span className="absolute left-2.5 top-11 block h-1 w-14 rounded-sm bg-white/50" />
        <span className="absolute bottom-2.5 left-2.5 block h-4 w-12 rounded-sm" style={{ backgroundColor: "#ff8a3d" }} />
        <span className="absolute right-2.5 top-3 bottom-2.5 block w-8 rounded-sm bg-white/15" />
      </span>
    );
  }
  if (look === "clean") {
    return (
      <span aria-hidden="true" className={cn("relative block h-20 w-full bg-white", auto && "opacity-90")}>
        <span className="absolute inset-x-0 top-0 block h-12" style={{ backgroundColor: `${c}14` }} />
        <span className="absolute left-2.5 top-3 block h-2 w-16 rounded-full bg-slate-800" />
        <span className="absolute left-2.5 block h-1 w-14 rounded-full bg-slate-400" style={{ top: 26 }} />
        <span className="absolute left-2.5 block h-3.5 w-10 rounded-full" style={{ top: 34, backgroundColor: c }} />
        <span className="absolute right-2.5 top-3 block h-8 w-9 rounded-lg" style={{ backgroundColor: `${c}33` }} />
        <span className="absolute bottom-2 left-2.5 block h-3 w-[30%] rounded-md border border-slate-200 bg-white" />
        <span className="absolute bottom-2 left-[38%] block h-3 w-[30%] rounded-md border border-slate-200 bg-white" />
      </span>
    );
  }
  return (
    <span aria-hidden="true" className={cn("relative block h-20 w-full", auto && "opacity-90")} style={{ backgroundColor: c }}>
      <span className="absolute inset-0 block bg-[repeating-linear-gradient(135deg,rgba(255,255,255,0.06)_0_6px,transparent_6px_12px)]" />
      <span className="absolute bottom-6 left-2.5 block font-serif text-[15px] italic leading-none text-white/95">Aa</span>
      <span className="absolute bottom-3 left-2.5 block h-1 w-16 bg-white/70" />
      <span className="absolute right-2.5 top-3 block h-1 w-8 bg-white/60" />
    </span>
  );
}
