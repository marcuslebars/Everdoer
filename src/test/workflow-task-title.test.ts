/** Workflow task titles render {{contact.first_name}} like messages do, instead of leaving it literal. */
import { describe, expect, it, vi } from "vitest";

import { renderTaskText } from "@/server/services/workflow-engine/actions";
import type { MessageTemplateData } from "@/server/services/workflow-engine/interpolate";

const ctx = { fields: { status: "todo" } } as never;
const data = (contact: Record<string, unknown> | null): MessageTemplateData => ({
  contact,
  company: { name: "A1 Marine Care" },
  booking: null,
  quote: null,
  fields: { status: "todo" },
});

describe("renderTaskText", () => {
  it("fills dotted tokens from the contact (the stale-lead nudge)", async () => {
    const get = vi.fn(async () => data({ first_name: "Cam", last_name: "R" }));
    expect(await renderTaskText("Follow up with {{contact.first_name}} — no activity in 3 days", ctx, get)).toBe(
      "Follow up with Cam — no activity in 3 days",
    );
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("an unnamed contact reads cleanly", async () => {
    expect(await renderTaskText("Follow up with {{contact.first_name}} — no activity in 3 days", ctx, async () => data({ first_name: "" }))).toBe(
      "Follow up with this lead — no activity in 3 days",
    );
  });

  it("bare tokens still use the flat fields, without loading entity data", async () => {
    const get = vi.fn(async () => data(null));
    expect(await renderTaskText("Status is {{status}}", ctx, get)).toBe("Status is todo");
    expect(get).not.toHaveBeenCalled();
  });

  it("never leaves a literal {{…}}", async () => {
    const out = await renderTaskText("Call {{contact.first_name}} about {{quote.boat}}", ctx, async () => data({ first_name: "Jo" }));
    expect(out).not.toContain("{{");
  });
});
