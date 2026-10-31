/**
 * Which business a Settings section shows, in an org with several: the one picked in the
 * section, else ?company= in the URL (links from "Your AI" → Customize), else the business chosen
 * in the top bar, else the first. One rule for every section.
 */
import { useState } from "react";
import { useOrg } from "@/lib/org-context";

/** PURE: the rule above. */
export function pickSettingsCompany(
  list: Array<{ id: string }>,
  choices: { picked: string | null; fromUrl: string | null; fromTopBar: string | null },
): string | null {
  for (const id of [choices.picked, choices.fromUrl, choices.fromTopBar]) {
    if (id && list.some((c) => c.id === id)) return id;
  }
  return list[0]?.id ?? null;
}

export function useSettingsCompany(list: Array<{ id: string }>): [string | null, (id: string) => void] {
  const { companyId: fromTopBar } = useOrg();
  const [picked, setPicked] = useState<string | null>(null);
  const fromUrl = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("company") : null;
  return [pickSettingsCompany(list, { picked, fromUrl, fromTopBar: fromTopBar ?? null }), setPicked];
}
