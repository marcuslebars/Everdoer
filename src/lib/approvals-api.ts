/** Owner approvals (docs/front-desk-ai.md "## Owner by text"): the dashboard list + Approve / Skip. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api-client";

export interface ApprovalItem {
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

/** A customer still waiting for an answer after the AI's request to the owner expired or failed. */
export interface WaitingCustomer {
  approvalId: string;
  companyId: string;
  companyName: string | null;
  contactId: string;
  contactName: string;
  kind: string;
  summary: string;
  /** The reply the AI had ready (send_reply), so the owner can send it as is. */
  draftReply: string | null;
  waitingSince: string;
}

export interface ApprovalList {
  pending: ApprovalItem[];
  recent: ApprovalItem[];
  /** Absent from an older API build: treat as none. */
  waiting?: WaitingCustomer[];
}

/** Where "Reply" on a waiting customer goes: their conversation, with the AI's draft ready to send. */
export function waitingReplyTarget(item: Pick<WaitingCustomer, "contactId" | "draftReply">): { to: string; state: { draft: string } | undefined } {
  return { to: `/inbox?contact=${encodeURIComponent(item.contactId)}`, state: item.draftReply ? { draft: item.draftReply } : undefined };
}

const HANDLED_KEY = "everdoer_waiting_handled";

/** Approvals the owner marked "Handled" on this device (they phoned, say). Never throws. */
export function readHandledWaiting(): string[] {
  try {
    const raw = window.localStorage.getItem(HANDLED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function markWaitingHandled(approvalId: string): string[] {
  // Capped: these ids only matter for the week an approval stays listed.
  const next = [...new Set([...readHandledWaiting(), approvalId])].slice(-100);
  try {
    window.localStorage.setItem(HANDLED_KEY, JSON.stringify(next));
  } catch {
    // Private window / blocked storage: it stays hidden for this visit only.
  }
  return next;
}

export interface DecideResponse {
  outcome: "done" | "already" | "expired" | "not_found";
  message: string;
}

const KEY = "approvals";

export function fetchApprovals(orgId: string, companyId?: string | null): Promise<ApprovalList> {
  const q = companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";
  return apiFetch<ApprovalList>(`/api/organizations/${orgId}/approvals${q}`);
}

export const decideApproval = (orgId: string, id: string, decision: "approve" | "skip") =>
  apiFetch<DecideResponse>(`/api/organizations/${orgId}/approvals/${id}/decide`, { method: "POST", body: JSON.stringify({ decision }) });

export function useApprovals(orgId: string, companyId?: string | null) {
  return useQuery({
    queryKey: [KEY, orgId, companyId ?? null],
    queryFn: () => fetchApprovals(orgId, companyId),
    enabled: Boolean(orgId),
    refetchInterval: 60_000,
  });
}

export function useDecideApproval(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; decision: "approve" | "skip" }) => decideApproval(orgId, input.id, input.decision),
    onSettled: () => qc.invalidateQueries({ queryKey: [KEY, orgId] }),
  });
}
