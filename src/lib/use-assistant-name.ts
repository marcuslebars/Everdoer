/**
 * The name the owner gave their AI (Your AI → Name), or null when they left the default. For
 * copy that names the assistant (assistantCopy in platform-brand.ts). Shares AiReadinessCard's
 * query, so it costs no extra request on pages that already show that card.
 */
import { useQuery } from "@tanstack/react-query";

import { getYourAiStep } from "@/lib/api-client";
import { useOnboardingProgress } from "@/lib/api-hooks";
import { useOrg } from "@/lib/org-context";

export function useAssistantName(): string | null {
  const { organizationId, companyId } = useOrg();
  const { data: progress } = useOnboardingProgress(organizationId);
  const target = companyId ?? progress?.company?.id ?? null;
  const { data } = useQuery({
    queryKey: ["your-ai-step", organizationId, target],
    queryFn: () => getYourAiStep(organizationId, target as string),
    enabled: Boolean(organizationId && target),
    staleTime: 60_000,
    retry: false,
  });
  return data?.view.persona.name?.trim() || null;
}
