/**
 * The name the owner gave their AI (Your AI → Name), for every piece of app copy that names it.
 *
 * AssistantNameProvider (mounted once, inside OrgProvider) reads it for the business being worked
 * in; useAssistantName() / useAssistantCopy() read the context. Outside a provider — a test, a
 * signed-out page — the name is null and copy falls back to the default (assistantCopy).
 */
import { createContext, useCallback, useContext, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";

import { getYourAiStep } from "@/lib/api-client";
import { useOnboardingProgress } from "@/lib/api-hooks";
import { useBrand } from "@/lib/brand-context";
import { useOrg } from "@/lib/org-context";
import { assistantCopy } from "@/lib/platform-brand";

const AssistantNameContext = createContext<string | null>(null);

export function AssistantNameProvider({ children }: { children: ReactNode }) {
  const { organizationId, companyId } = useOrg();
  const { data: progress } = useOnboardingProgress(organizationId);
  // The business picked in the top bar, else the account's first (for most owners, its only one).
  const target = companyId ?? progress?.company?.id ?? null;
  // Same query as Home's readiness card, so the name costs no extra request there.
  const { data } = useQuery({
    queryKey: ["your-ai-step", organizationId, target],
    queryFn: () => getYourAiStep(organizationId, target as string),
    enabled: Boolean(organizationId && target),
    staleTime: 60_000,
    retry: false,
  });
  return <AssistantNameContext.Provider value={data?.view.persona.name?.trim() || null}>{children}</AssistantNameContext.Provider>;
}

/** The owner's name for their AI, or null when they kept the default. */
export function useAssistantName(): string | null {
  return useContext(AssistantNameContext);
}

/** `copy("Call with Everly")` → "Call with Sam" / "Call with Everly" / "Call with the AI receptionist". */
export function useAssistantCopy(): (text: string) => string {
  const brand = useBrand();
  const name = useAssistantName();
  return useCallback((text: string) => assistantCopy(text, brand, name), [brand, name]);
}
