/** The backfill for businesses that missed their starter automations (migration 20261031100000). */
import { beforeEach, describe, expect, it, vi } from "vitest";

const installRecipes = vi.fn();
vi.mock("@/server/services/workflow-engine/recipes/install", () => ({ installRecipes: (...a: unknown[]) => installRecipes(...a) }));

import { findMissingRecipes, runInstallMissingRecipes } from "@/server/jobs/install-missing-recipes";
import { ALL_RECIPES } from "@/server/services/workflow-engine/recipes";
import { createFakeDb } from "@/test/helpers/fake-supabase";

const ALL = ALL_RECIPES.map((r) => r.slug);

function seed() {
  return createFakeDb({
    companies: [
      { id: "co-first", organization_id: "org-a1", name: "A1 Marine Care", stage: "active" },
      { id: "co-second", organization_id: "org-a1", name: "A1 Coatings", stage: "prospect" },
      { id: "co-gone", organization_id: "org-a1", name: "A1 Marine Storage", stage: "archived" },
    ],
    workflows: [
      ...ALL.map((slug) => ({ organization_id: "org-a1", company_id: "co-first", slug })),
      { organization_id: "org-a1", company_id: "co-second", slug: ALL[0] },
    ],
  });
}

beforeEach(() => {
  installRecipes.mockReset().mockResolvedValue({ installed: [{ slug: "x", workflowId: "w", status: "draft", disabledReason: "Seeded as draft" }, { slug: "y", workflowId: "w2", status: "active", disabledReason: null }], skipped: [] });
});

describe("install-missing-recipes", () => {
  it("finds what each live business is missing (per business, archived skipped)", async () => {
    const rows = await findMissingRecipes(seed().client);
    expect(rows).toEqual([{ organizationId: "org-a1", companyId: "co-second", company: "A1 Coatings", missing: ALL.slice(1) }]);
  });

  it("dry run installs nothing; --apply installs with customer-facing ones as drafts", async () => {
    const db = seed();
    const lines: string[] = [];
    expect(await runInstallMissingRecipes(db.client, false, (l) => lines.push(l))).toBe(0);
    expect(installRecipes).not.toHaveBeenCalled();
    expect(lines[0]).toMatch(/^A1 Coatings: missing \d+/);
    lines.length = 0;
    expect(await runInstallMissingRecipes(db.client, true, (l) => lines.push(l))).toBe(0);
    expect(installRecipes).toHaveBeenCalledWith({ organizationId: "org-a1", actorProfileId: null, supabase: db.client }, "co-second", { forceDraftCustomerFacing: true });
    expect(lines).toEqual(["A1 Coatings: installed 2 (1 as drafts to review)"]);
  });

  it("a failure is reported and the job exits non-zero", async () => {
    installRecipes.mockRejectedValueOnce(new Error("boom"));
    const lines: string[] = [];
    expect(await runInstallMissingRecipes(seed().client, true, (l) => lines.push(l))).toBe(1);
    expect(lines[0]).toBe("A1 Coatings: FAILED - boom");
  });
});
