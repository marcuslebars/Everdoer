import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Bot, ChevronRight } from "lucide-react";

import { getYourAiStep } from "@/lib/api-client";
import { readinessGaps, type ReadinessKey } from "@/lib/ai-readiness";
import { useOnboardingProgress, useSetupChecklist } from "@/lib/api-hooks";
import { ONBOARDING_STEP_COUNT } from "@/lib/onboarding-steps";

/**
 * "Your AI isn't fully working yet" — what's missing (src/lib/ai-readiness.ts), each with a link
 * to fix it. On Today and on Your AI. Hidden when nothing's missing, and while a setup card
 * already covers it: the done-for-you "We're setting you up" card until they're live, and the
 * wizard's "Finish setting up" card until a self-serve owner finishes onboarding (`hideDuringSetup`).
 */
export function AiReadinessCard({
  orgId,
  companyId,
  hideDuringSetup = true,
  omit = [],
}: {
  orgId: string;
  companyId: string | null;
  hideDuringSetup?: boolean;
  /** Gaps the page itself already shows (Your AI has the texts / calls switches right there). */
  omit?: ReadinessKey[];
}) {
  const { data: setup, isLoading: setupLoading } = useSetupChecklist(orgId);
  const { data: progress } = useOnboardingProgress(orgId);
  const target = companyId ?? progress?.company?.id ?? null;
  const { data } = useQuery({
    queryKey: ["your-ai-step", orgId, target],
    queryFn: () => getYourAiStep(orgId, target as string),
    enabled: Boolean(orgId && target),
    staleTime: 60_000,
  });

  if (!data) return null;
  if (hideDuringSetup) {
    if (setupLoading || (setup && !setup.isLive)) return null;
    const unfinished = !setup && progress?.company && progress.steps.filter((s) => s.status === "complete").length < ONBOARDING_STEP_COUNT;
    if (unfinished) return null;
  }
  const gaps = readinessGaps(data.readiness).filter((g) => !omit.includes(g.key));
  if (gaps.length === 0) return null;

  return (
    <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-2" aria-label="Your AI isn't fully set up">
      <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Bot className="w-4 h-4 text-amber-400" /> Your AI isn't fully working yet
      </p>
      <ul className="divide-y divide-border/60">
        {gaps.map((g) => (
          <li key={g.key}>
            <Link to={g.href} className="flex items-center justify-between gap-3 py-2 text-sm text-muted-foreground hover:text-foreground">
              <span>{g.text}</span>
              <ChevronRight className="w-4 h-4 shrink-0" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
