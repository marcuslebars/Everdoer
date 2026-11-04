import { NextResponse } from "next/server";
import { z } from "zod";

import type { Json } from "@/server/db/database.types";
import { handleRoute, parseJsonBody } from "@/server/api/route";
import { requireOrganizationContext } from "@/server/organizations/context";
import { listCompanies } from "@/server/services/companies";
import {
  ONBOARDING_STEPS,
  getOnboardingProgress,
  isOnboardingStep,
  nextOnboardingStep,
  recordOnboardingEvent,
  upsertOnboardingStep,
  type OnboardingEventType,
} from "@/server/services/onboarding";
import { createSupabaseServerClient } from "@/server/supabase/server";

export const dynamic = "force-dynamic";

/** companies.hours as the one-line text the Business step edits ({ summary } from the wizard). */
function hoursSummary(hours: unknown): string | null {
  if (typeof hours === "string") return hours.trim() || null;
  if (hours && typeof hours === "object" && !Array.isArray(hours)) {
    const summary = (hours as Record<string, unknown>).summary;
    return typeof summary === "string" && summary.trim() ? summary.trim() : null;
  }
  return null;
}

/**
 * The "Your AI" step was added after some businesses had finished onboarding. It counts as done
 * when the company's texting agent is already on, or every other step is done — so a finished
 * onboarding doesn't reopen at it. (Shown done, not stored.)
 */
function withAiStep<T extends { step: string; status: string }>(steps: T[], aiSettings: unknown): T[] {
  if (steps.some((s) => s.step === "ai")) return steps;
  const sms = aiSettings && typeof aiSettings === "object" && !Array.isArray(aiSettings) ? (aiSettings as Record<string, unknown>).sms_agent : null;
  const textsOn = Boolean(sms && typeof sms === "object" && (sms as Record<string, unknown>).enabled === true);
  const othersDone = ONBOARDING_STEPS.filter((s) => s !== "ai").every((s) => steps.some((row) => row.step === s && row.status === "complete"));
  if (!textsOn && !othersDone) return steps;
  return [...steps, { step: "ai", status: "complete", data: {}, synthetic: true } as unknown as T];
}

interface RouteContext {
  params: { organizationId: string };
}

/** Resume state: the onboarding company (first one) + per-step progress rows. */
export async function GET(_request: Request, context: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    const supabase = createSupabaseServerClient();
    const organization = await requireOrganizationContext(supabase, context.params.organizationId);
    const ctx = { actorProfileId: organization.user.id, organizationId: organization.organizationId, supabase };

    const companies = await listCompanies(ctx, { limit: 1 });
    const company = companies[0] ?? null;
    const saved = company ? await getOnboardingProgress(ctx, company.id) : [];
    const steps = withAiStep(saved, company?.ai_settings);
    const completed = steps.filter((s) => s.status === "complete").map((s) => s.step);

    return NextResponse.json({
      data: {
        company: company
          ? {
              id: company.id,
              name: company.name,
              // What the Business step pre-fills (re-saving a blank form used to wipe these).
              profile: {
                website: company.website ?? null,
                timezone: company.timezone ?? null,
                hours: hoursSummary(company.hours),
                serviceArea: company.service_area ?? null,
                ownerEmail: company.owner_email ?? null,
                ownerPhone: company.owner_phone_e164 ?? null,
                ownerPhoneVerified: Boolean(company.owner_phone_e164 && company.owner_phone_verified_at),
                logoUrl: company.brand_logo_url ?? null,
              },
            }
          : null,
        steps,
        nextStep: nextOnboardingStep(completed),
      },
    });
  });
}

const upsertBodySchema = z.object({
  companyId: z.string().uuid(),
  step: z.string().min(1).max(40),
  status: z.enum(["pending", "in_progress", "complete", "error"]).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  completed: z.boolean().optional(),
  event: z.enum(["start", "complete", "error"]).optional(),
});

/** Upsert a step's progress and optionally log an instrumentation event. */
export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    const supabase = createSupabaseServerClient();
    const organization = await requireOrganizationContext(supabase, context.params.organizationId);
    const ctx = { actorProfileId: organization.user.id, organizationId: organization.organizationId, supabase };
    const body = await parseJsonBody(request, upsertBodySchema);

    if (!isOnboardingStep(body.step)) {
      return NextResponse.json({ error: `Unknown onboarding step: ${body.step}` }, { status: 400 });
    }

    if (body.event) {
      await recordOnboardingEvent(ctx, {
        companyId: body.companyId,
        step: body.step,
        event: body.event as OnboardingEventType,
      });
    }

    const row = await upsertOnboardingStep(ctx, body.companyId, body.step, {
      status: body.status,
      data: body.data as Json | undefined,
      completed: body.completed,
    });

    return NextResponse.json({ data: row });
  });
}
