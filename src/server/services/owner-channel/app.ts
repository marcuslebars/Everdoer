/**
 * The in-app Approvals list (pending + recent decisions) and its Approve / Skip buttons.
 *
 * SANCTIONED EXCEPTION (service role) for the DECIDE path only: owner_approvals is not
 * client-writable (20261009100000_front_desk_ai), so the route checks the caller is an owner/
 * admin of the organization (requireOrganizationContext + role) and then runs the same decide
 * path as a texted "Y"/"N" with a service-role client pinned to that organization id — the
 * approval is loaded with .eq("organization_id", <caller's org>), so an id from another org is
 * "not found". Listing reads through the caller's own RLS client.
 */
import { z } from "zod";

import type { Tables } from "@/server/db/database.types";
import type { TenantServiceContext } from "@/server/services/shared";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { decideApproval, type DecideOutcome } from "./approvals";

export interface ApprovalView {
  id: string;
  companyId: string;
  companyName: string | null;
  contactId: string | null;
  kind: string;
  summary: string;
  status: string;
  shortCode: number | null;
  createdAt: string;
  expiresAt: string | null;
  decidedAt: string | null;
  decidedVia: string | null;
  resultMessage: string | null;
}

/**
 * A customer the AI told "I'm checking with the owner" whose approval then expired (or failed)
 * and who has had no text or email from the business since. Nobody else will answer them — the
 * conversation was handed to the owner — so Home keeps them in front of the owner until someone
 * does (or the week is up).
 */
export interface WaitingCustomerView {
  approvalId: string;
  companyId: string;
  companyName: string | null;
  contactId: string;
  contactName: string;
  kind: string;
  summary: string;
  /** The reply the AI had ready, when the approval carried one (send_reply) — the owner can send it as is. */
  draftReply: string | null;
  /** When the AI first asked the owner: how long the customer has been waiting. */
  waitingSince: string;
}

export interface ApprovalList {
  pending: ApprovalView[];
  recent: ApprovalView[];
  waiting: WaitingCustomerView[];
}

/** Statuses that leave the customer unanswered and the conversation with the owner. */
const UNANSWERED_STATUSES = ["expired", "failed"];

type Row = Tables<"owner_approvals">;

function view(row: Row, names: Map<string, string>): ApprovalView {
  const result = row.result && typeof row.result === "object" && !Array.isArray(row.result) ? (row.result as Record<string, unknown>) : {};
  return {
    id: row.id,
    companyId: row.company_id,
    companyName: names.get(row.company_id) ?? null,
    contactId: row.contact_id,
    kind: row.kind,
    summary: row.summary,
    status: row.status,
    shortCode: row.short_code,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    decidedAt: row.decided_at,
    decidedVia: row.decided_via,
    resultMessage: typeof result.message === "string" ? result.message : null,
  };
}

export async function listApprovalsForOrg(ctx: TenantServiceContext, options: { companyId?: string | null; nowMs?: number } = {}): Promise<ApprovalList> {
  const nowMs = options.nowMs ?? Date.now();
  let pendingQ = ctx.supabase.from("owner_approvals").select("*").eq("organization_id", ctx.organizationId).eq("status", "pending");
  let recentQ = ctx.supabase
    .from("owner_approvals")
    .select("*")
    .eq("organization_id", ctx.organizationId)
    .neq("status", "pending")
    .gte("updated_at", new Date(nowMs - 7 * 86_400_000).toISOString());
  if (options.companyId) {
    pendingQ = pendingQ.eq("company_id", options.companyId);
    recentQ = recentQ.eq("company_id", options.companyId);
  }
  const [pending, recent, companies] = await Promise.all([
    pendingQ.order("created_at", { ascending: false }).limit(50),
    recentQ.order("updated_at", { ascending: false }).limit(15),
    ctx.supabase.from("companies").select("id, name").eq("organization_id", ctx.organizationId),
  ]);
  if (pending.error) throw pending.error;
  if (recent.error) throw recent.error;
  const names = new Map(((companies.data ?? []) as Array<{ id: string; name: string }>).map((c) => [c.id, c.name]));
  const pendingRows = (pending.data ?? []) as Row[];
  return {
    pending: pendingRows.map((r) => view(r, names)),
    recent: ((recent.data ?? []) as Row[]).map((r) => view(r, names)),
    waiting: await listWaitingCustomers(ctx, { companyId: options.companyId ?? null, nowMs, pendingRows, names }),
  };
}

/** When the approval stopped being the AI's to act on (the expiry, or the failed send). */
function unansweredSince(row: Row): string {
  return row.decided_at ?? row.updated_at;
}

/**
 * Which unanswered approvals still have a customer waiting. PURE.
 *  - one row per customer: the newest unanswered approval wins;
 *  - not when a newer request for the same customer is pending (it's already in the list above);
 *  - not once the business has texted or emailed them after the approval lapsed.
 */
export function stillWaiting(rows: Row[], input: { pendingContactIds: Set<string>; lastOutboundByContact: Map<string, string> }): Row[] {
  const newestFirst = rows.slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
  const seen = new Set<string>();
  const out: Row[] = [];
  for (const row of newestFirst) {
    const contactId = row.contact_id;
    if (!contactId || seen.has(contactId)) continue;
    seen.add(contactId);
    if (input.pendingContactIds.has(contactId)) continue;
    const lastOutbound = input.lastOutboundByContact.get(contactId);
    if (lastOutbound && new Date(lastOutbound).getTime() > new Date(unansweredSince(row)).getTime()) continue;
    out.push(row);
  }
  return out;
}

/** A contact's name for the owner: their name, else their number, else "A customer". PURE. */
export function waitingContactName(contact: { first_name: string | null; last_name: string | null; phone: string | null } | undefined): string {
  if (!contact) return "A customer";
  // A contact created from a text has their number as the first name until someone names them.
  const first = contact.first_name && !/^\+?\d[\d\s()-]{6,}$/.test(contact.first_name.trim()) ? contact.first_name.trim() : "";
  return [first, contact.last_name?.trim()].filter(Boolean).join(" ") || contact.phone || contact.first_name?.trim() || "A customer";
}

function draftReplyOf(row: Row): string | null {
  if (row.kind !== "send_reply") return null;
  const payload = row.payload && typeof row.payload === "object" && !Array.isArray(row.payload) ? (row.payload as Record<string, unknown>) : {};
  return typeof payload.replyText === "string" && payload.replyText.trim() ? payload.replyText.trim() : null;
}

async function listWaitingCustomers(
  ctx: TenantServiceContext,
  input: { companyId: string | null; nowMs: number; pendingRows: Row[]; names: Map<string, string> },
): Promise<WaitingCustomerView[]> {
  let query = ctx.supabase
    .from("owner_approvals")
    .select("*")
    .eq("organization_id", ctx.organizationId)
    .in("status", UNANSWERED_STATUSES)
    .not("contact_id", "is", null)
    .gte("updated_at", new Date(input.nowMs - 7 * 86_400_000).toISOString());
  if (input.companyId) query = query.eq("company_id", input.companyId);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(50);
  if (error) throw error;
  const rows = (data ?? []) as Row[];
  if (rows.length === 0) return [];

  const contactIds = [...new Set(rows.map((r) => r.contact_id).filter((id): id is string => Boolean(id)))];
  const earliest = rows.map(unansweredSince).sort()[0];
  const [sent, contacts] = await Promise.all([
    ctx.supabase
      .from("message_log")
      .select("contact_id, created_at")
      .eq("organization_id", ctx.organizationId)
      .eq("direction", "outbound")
      .eq("status", "sent")
      .in("contact_id", contactIds)
      .gte("created_at", earliest)
      .order("created_at", { ascending: false })
      .limit(1000),
    ctx.supabase.from("contacts").select("id, first_name, last_name, phone").eq("organization_id", ctx.organizationId).in("id", contactIds),
  ]);
  if (sent.error) throw sent.error;
  if (contacts.error) throw contacts.error;

  // Newest first, so the first one seen per contact is their latest.
  const lastOutboundByContact = new Map<string, string>();
  for (const m of (sent.data ?? []) as Array<{ contact_id: string | null; created_at: string }>) {
    if (m.contact_id && !lastOutboundByContact.has(m.contact_id)) lastOutboundByContact.set(m.contact_id, m.created_at);
  }
  const contactById = new Map(
    ((contacts.data ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null; phone: string | null }>).map((c) => [c.id, c]),
  );
  const pendingContactIds = new Set(input.pendingRows.map((r) => r.contact_id).filter((id): id is string => Boolean(id)));

  return stillWaiting(rows, { pendingContactIds, lastOutboundByContact }).map((row) => ({
    approvalId: row.id,
    companyId: row.company_id,
    companyName: input.names.get(row.company_id) ?? null,
    contactId: row.contact_id as string,
    contactName: waitingContactName(contactById.get(row.contact_id as string)),
    kind: row.kind,
    summary: row.summary,
    draftReply: draftReplyOf(row),
    waitingSince: row.created_at,
  }));
}

export const decideApprovalBodySchema = z.object({
  decision: z.enum(["approve", "skip"]),
  note: z.string().trim().max(500).nullish(),
});

export async function decideApprovalFromApp(
  ctx: TenantServiceContext,
  approvalId: string,
  body: z.infer<typeof decideApprovalBodySchema>,
): Promise<{ outcome: DecideOutcome; message: string; approval: ApprovalView | null }> {
  const admin = createSupabaseAdminClient();
  const decided = await decideApproval(
    admin,
    approvalId,
    { approved: body.decision === "approve", ownerNote: body.note ?? null, decidedVia: "app", decidedBy: ctx.actorProfileId ?? "app" },
    { organizationId: ctx.organizationId },
  );
  return { outcome: decided.outcome, message: decided.message, approval: decided.approval ? view(decided.approval, new Map()) : null };
}
