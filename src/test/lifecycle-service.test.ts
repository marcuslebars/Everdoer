import { describe, expect, it, vi } from "vitest";

import { createFakeDb } from "./fake-supabase";
import { LIFECYCLE_START_MS } from "@/server/services/lifecycle/rules";
import { runLifecyclePass, type LifecycleConfig, type LifecycleDeps } from "@/server/services/lifecycle/service";

const D = 86_400_000;
const ORG = "11111111-1111-4111-8111-111111111111";
const APP_ORG = "22222222-2222-4222-8222-222222222222";
const OLD_ORG = "33333333-3333-4333-8333-333333333333";
const COMPANY = "44444444-4444-4444-8444-444444444444";
// Wednesday 25 Nov 2026, 10:00 Toronto.
const NOW = Date.parse("2026-11-25T15:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();

const config: LifecycleConfig = { enabled: true, operatorPhone: "+17055296157", replyTo: "hello@everdoer.com", taxed: true };

function deps() {
  const emails: Array<{ to: string; subject: string; body: string; fromName?: string; replyTo?: string }> = [];
  const texts: Array<{ to: string; body: string }> = [];
  const d: LifecycleDeps = {
    sendEmail: vi.fn(async (input) => {
      emails.push(input as never);
      return {};
    }),
    sendSms: vi.fn(async (input) => {
      texts.push(input as never);
      return { sid: "SM1" };
    }),
    emailConfigured: () => true,
    smsConfigured: () => true,
    loadResults: async () => ({ missedCallsCaught: 4, callsAnswered: 3, textsSent: 9, leads: 4, jobsBooked: 1 }),
    loadPrices: async () => ({ firstCharge: "CA$337.87", monthlyPrice: "CA$299.00" }),
  };
  return { d, emails, texts };
}

function seed(over: { status?: string; liveAt?: string | null; sent?: string[]; subUpdated?: string } = {}) {
  const created = NOW - 6 * D;
  return createFakeDb({
    organizations: [
      { id: ORG, name: "Bay Roofing", created_at: iso(created), plan: "operate", subscription_status: over.status ?? "trialing", trial_ends_at: null, platform_brand: "everdoer", billing_email: null },
      { id: APP_ORG, name: "Pine Plumbing", created_at: iso(NOW - D), plan: "launch", subscription_status: "trialing", trial_ends_at: iso(NOW + 13 * D), platform_brand: "everdoer", billing_email: "pine@example.com" },
      { id: OLD_ORG, name: "Old Co", created_at: iso(LIFECYCLE_START_MS - D), plan: "operate", subscription_status: "canceled", trial_ends_at: null, platform_brand: "everdoer", billing_email: null },
    ],
    crankleads_purchases: [
      {
        organization_id: ORG,
        company_id: COMPANY,
        tier: "close",
        business_name: "Bay Roofing",
        owner_name: "Dana Smith",
        owner_email: "dana@bayroofing.ca",
        owner_phone: "+17055550100",
        created_at: iso(created),
        live_at: over.liveAt === undefined ? iso(created + D) : over.liveAt,
        stripe_subscription_id: "sub_1",
      },
    ],
    subscriptions: [
      { organization_id: ORG, stripe_subscription_id: "sub_1", status: over.status ?? "trialing", current_period_end: iso(created + 14 * D), updated_at: over.subUpdated ?? iso(created) },
    ],
    companies: [{ id: COMPANY, timezone: "America/Toronto" }],
    lifecycle_sends: (over.sent ?? []).map((key) => ({ organization_id: ORG, key, channel: "email", status: "sent" })),
  });
}

describe("runLifecyclePass", () => {
  it("day 6 of a live trial: results email to the owner, signup + live texts to Marcus, nothing about old accounts", async () => {
    const db = seed();
    const { d, emails, texts } = deps();
    const out = await runLifecyclePass(db.client as never, NOW, config, d);

    expect(emails).toHaveLength(1);
    expect(emails[0]).toMatchObject({ to: "dana@bayroofing.ca", fromName: "Marcus at Everdoer", replyTo: "hello@everdoer.com" });
    expect(emails[0].subject).toBe("Bay Roofing's first days with Everdoer");
    expect(emails[0].body).toContain("4 missed calls caught and followed up");
    expect(emails[0].body).toContain("2967 Dundas St. W.");

    expect(texts.map((t) => t.to)).toEqual(["+17055296157", "+17055296157", "+17055296157"]);
    expect(texts.map((t) => t.body)).toEqual([
      "Everdoer: new signup! Bay Roofing started a Close trial. Dana Smith, +17055550100.",
      "Everdoer: Bay Roofing is live. Their missed calls are now being caught.",
      "Everdoer: new app sign-up: Pine Plumbing. pine@example.com.",
    ]);
    expect(out.filter((o) => o.organizationId === OLD_ORG)).toEqual([]);
    expect(db.tables.lifecycle_sends.map((r) => `${r.key}:${r.status}`).sort()).toEqual(
      ["op_live:sent", "op_signup:sent", "op_signup:sent", "trial_results:sent"].sort(),
    );
  });

  it("is idempotent: a second pass sends nothing new", async () => {
    const db = seed();
    const first = deps();
    await runLifecyclePass(db.client as never, NOW, config, first.d);
    const second = deps();
    await runLifecyclePass(db.client as never, NOW + 60_000, config, second.d);
    expect(second.emails).toHaveLength(0);
    expect(second.texts).toHaveLength(0);
  });

  it("trial ending: names the date and the Stripe amounts", async () => {
    const db = seed({ sent: ["op_signup", "op_live", "trial_results"] });
    const { d, emails } = deps();
    await runLifecyclePass(db.client as never, NOW + 5 * D, config, d);
    expect(emails).toHaveLength(1);
    expect(emails[0].subject).toBe("Your Everdoer trial ends Thursday, December 3");
    expect(emails[0].body).toContain("your card is charged CA$337.87 (tax included) for your first month, then CA$299.00 plus tax a month after that.");
    expect(emails[0].body).toContain("/settings/billing");
  });

  it("converted: welcome email and a text", async () => {
    const db = seed({ status: "active", sent: ["op_signup", "op_live", "trial_results", "trial_ending"] });
    const { d, emails, texts } = deps();
    await runLifecyclePass(db.client as never, NOW + 9 * D, config, d);
    expect(emails.map((e) => e.subject)).toEqual(["Welcome aboard, Dana"]);
    expect(texts.map((t) => t.body)).toContain("Everdoer: Bay Roofing converted from trial to paid (Close).");
  });

  it("cancelled: exit email and a text", async () => {
    const db = seed({ status: "canceled", subUpdated: iso(NOW - D), sent: ["op_signup", "op_live"] });
    const { d, emails, texts } = deps();
    await runLifecyclePass(db.client as never, NOW, config, d);
    expect(emails.map((e) => e.subject)).toEqual(["Sorry to see you go"]);
    expect(emails[0].body).toContain("##004#");
    expect(texts.map((t) => t.body)).toContain("Everdoer: Bay Roofing cancelled. Dana Smith, +17055550100.");
  });

  it("no operator phone → no texts; turned off → nothing", async () => {
    const { d, texts, emails } = deps();
    await runLifecyclePass(seed().client as never, NOW, { ...config, operatorPhone: null }, d);
    expect(texts).toHaveLength(0);
    expect(emails).toHaveLength(1);
    const off = deps();
    expect(await runLifecyclePass(seed().client as never, NOW, { ...config, enabled: false }, off.d)).toEqual([]);
  });

  it("a failed send is recorded and not retried", async () => {
    const db = seed({ sent: ["op_signup", "op_live"] });
    const { d } = deps();
    d.sendEmail = vi.fn(async () => {
      throw new Error("resend down");
    });
    const out = await runLifecyclePass(db.client as never, NOW, config, d);
    expect(out).toContainEqual(expect.objectContaining({ key: "trial_results", status: "failed" }));
    expect(db.tables.lifecycle_sends.find((r) => r.key === "trial_results")).toMatchObject({ status: "failed", error: "resend down" });
  });
});
