/**
 * Generated-site looks (docs/done-for-you.md → "Generated sites" → "Looks"). Shared by the
 * server (render, generator, intake) and the owner screens (quick setup, Settings → Your
 * website). Pure: no I/O.
 *
 * A look changes only how the page is drawn (fonts, colour use, section layouts). The facts, copy,
 * quote form, booking link and SEO data are the same in every look, so switching is instant and
 * never needs the AI to rewrite anything.
 */

export const SITE_THEMES = ["bold", "clean", "classic"] as const;
export type SiteThemeId = (typeof SITE_THEMES)[number];
/** "auto" = we pick from the business's trade. */
export type SiteThemeChoice = SiteThemeId | "auto";
export const SITE_THEME_CHOICES: readonly SiteThemeChoice[] = ["auto", ...SITE_THEMES];

export interface SiteThemeOption {
  id: SiteThemeChoice;
  label: string;
  description: string;
}

export const SITE_THEME_OPTIONS: readonly SiteThemeOption[] = [
  { id: "auto", label: "Pick for me", description: "We choose the look that suits your trade." },
  { id: "bold", label: "Bold", description: "Strong colour, big lettering and a price sheet. Like your truck door." },
  { id: "clean", label: "Clean", description: "Bright and friendly, with service cards and online booking up front." },
  { id: "classic", label: "Classic", description: "Calm and upscale, led by photos of your work." },
];

/** Colours the owner can pick from. Each passes 4.5:1 with white text. */
export const SITE_COLOR_SWATCHES = ["#13283b", "#1d4ed8", "#0f766e", "#1f3a2e", "#7c2d12", "#b91c1c", "#6d28d9", "#334155"] as const;

export interface SiteStyle {
  theme: SiteThemeChoice;
  /** The page's main colour, or null for the business's brand colour (else the trade's). */
  color: string | null;
}

export const DEFAULT_SITE_STYLE: SiteStyle = { theme: "auto", color: null };

const HEX = /^#[0-9a-f]{6}$/i;

export function isSiteThemeChoice(value: unknown): value is SiteThemeChoice {
  return typeof value === "string" && (SITE_THEME_CHOICES as readonly string[]).includes(value);
}

/** Read a stored style defensively (companies.site_style, content.settings, intake answers). */
export function parseSiteStyle(raw: unknown): SiteStyle {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...DEFAULT_SITE_STYLE };
  const r = raw as Record<string, unknown>;
  return {
    theme: isSiteThemeChoice(r.theme) ? r.theme : "auto",
    color: typeof r.color === "string" && HEX.test(r.color) ? r.color.toLowerCase() : null,
  };
}

/**
 * The look "Pick for me" lands on, by trade (the industry pack id). Hands-on outdoor trades get
 * Bold, home-service trades get Clean, design-led and lake trades get Classic.
 */
export function autoThemeForTrade(tradeId: string | null | undefined): SiteThemeId {
  switch (tradeId) {
    case "property-maintenance-snow":
    case "roofing":
    case "general-contractor":
      return "bold";
    case "landscaping":
    case "marine":
      return "classic";
    default:
      return "clean";
  }
}

export function resolveSiteTheme(choice: SiteThemeChoice | null | undefined, tradeId: string | null | undefined): SiteThemeId {
  return choice && choice !== "auto" ? choice : autoThemeForTrade(tradeId);
}

export function siteThemeLabel(id: SiteThemeId): string {
  return SITE_THEME_OPTIONS.find((o) => o.id === id)?.label ?? id;
}
