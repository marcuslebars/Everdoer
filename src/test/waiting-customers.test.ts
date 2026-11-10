/** Home's "still waiting" list: which expired / failed approvals still have a customer nobody answered. */
import { describe, expect, it } from "vitest";

import type { Tables } from "@/server/db/database.types";
import { stillWaiting, waitingContactName } from "@/server/services/owner-channel/app";

type Row = Tables<"owner_approvals">;

const at = (hoursAgo: number) => new Date(Date.UTC(2026, 10, 9, 12) - hoursAgo * 3_600_000).toISOString();

function row(over: Partial<Row>): Row {
  return {
    id: "a-1", organization_id: "org-1", company_id: "co-1", contact_id: "c-1", conversation_id: null, kind: "send_reply",
    summary: "OK to text them this?", payload: {}, status: "expired", short_code: 1, requested_by: "sms_agent",
    created_at: at(48), expires_at: at(24), decided_at: at(24), decided_via: "expiry", decided_by: "system", updated_at: at(24),
    execution_claimed_at: null, notified_at: at(48), notified_to: null, notify_attempts: 1, notify_retry_at: null, result: null,
    ...over,
  } as Row;
}

const none = { pendingContactIds: new Set<string>(), lastOutboundByContact: new Map<string, string>() };

describe("stillWaiting", () => {
  it("lists a customer whose request expired and who has heard nothing since", () => {
    expect(stillWaiting([row({})], none).map((r) => r.id)).toEqual(["a-1"]);
  });

  it("the AI's own 'checking with the owner' text, sent before the expiry, doesn't count as an answer", () => {
    const lastOutboundByContact = new Map([["c-1", at(47)]]);
    expect(stillWaiting([row({})], { ...none, lastOutboundByContact })).toHaveLength(1);
  });

  it("drops them once the business has messaged them after the expiry", () => {
    const lastOutboundByContact = new Map([["c-1", at(2)]]);
    expect(stillWaiting([row({})], { ...none, lastOutboundByContact })).toEqual([]);
  });

  it("drops them when a newer request for the same customer is pending (it's already listed)", () => {
    expect(stillWaiting([row({})], { ...none, pendingContactIds: new Set(["c-1"]) })).toEqual([]);
  });

  it("one row per customer, the newest; and nothing for approvals with no customer", () => {
    const rows = [row({ id: "old", created_at: at(90) }), row({ id: "new", created_at: at(30) }), row({ id: "owner-only", contact_id: null })];
    expect(stillWaiting(rows, none).map((r) => r.id)).toEqual(["new"]);
  });

  it("measures 'since' from updated_at when a failed send recorded no decision time", () => {
    const failed = row({ status: "failed", decided_at: null, updated_at: at(10) });
    expect(stillWaiting([failed], { ...none, lastOutboundByContact: new Map([["c-1", at(12)]]) })).toHaveLength(1);
    expect(stillWaiting([failed], { ...none, lastOutboundByContact: new Map([["c-1", at(5)]]) })).toEqual([]);
  });
});

describe("waitingContactName", () => {
  it("uses the name, falls back to the number, and never shows a number twice", () => {
    expect(waitingContactName({ first_name: "Dana", last_name: "Lee", phone: "+17055550148" })).toBe("Dana Lee");
    expect(waitingContactName({ first_name: "+17055550148", last_name: null, phone: "+17055550148" })).toBe("+17055550148");
    expect(waitingContactName({ first_name: null, last_name: null, phone: null })).toBe("A customer");
    expect(waitingContactName(undefined)).toBe("A customer");
  });
});
