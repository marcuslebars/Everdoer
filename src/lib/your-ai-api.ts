/** "Your AI" page client (docs/your-ai.md): GET the switches, PATCH one switch or the name/tone. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

export type YourAiTone = "friendly" | "professional" | "casual";

export interface YourAiSwitch {
  key: string;
  group: "customers" | "paid" | "jobs" | "growing" | "posted";
  label: string;
  description: string;
  customize: string | null;
  choices?: Array<{ value: string; label: string }>;
  on: boolean;
  choice?: string;
  needs?: string;
}

export interface YourAiView {
  companyId: string;
  persona: { name: string | null; tone: YourAiTone | null; defaultName: string };
  switches: YourAiSwitch[];
}

export type YourAiPatch = { switch: string; on: boolean; choice?: string } | { persona: { name: string | null; tone: YourAiTone | null } };

export const YOUR_AI_GROUPS: Array<{ id: YourAiSwitch["group"]; title: string }> = [
  { id: "customers", title: "Talking to customers" },
  { id: "paid", title: "Getting paid" },
  { id: "jobs", title: "Running jobs" },
  { id: "growing", title: "Growing" },
  { id: "posted", title: "Keeping you posted" },
];

const path = (orgId: string, companyId: string) => `/api/organizations/${orgId}/companies/${companyId}/your-ai`;

export function useYourAi(orgId: string, companyId: string | null) {
  return useQuery({
    queryKey: ["your-ai", orgId, companyId],
    queryFn: () => apiFetch<YourAiView>(path(orgId, companyId as string)),
    enabled: Boolean(orgId && companyId),
    staleTime: 30_000,
  });
}

export function useUpdateYourAi(orgId: string, companyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: YourAiPatch) => apiFetch<YourAiView>(path(orgId, companyId as string), { method: "PATCH", body: JSON.stringify(patch) }),
    onSuccess: (view) => {
      qc.setQueryData(["your-ai", orgId, companyId], view);
      // The detailed Settings cards read the same settings: refresh them too.
      void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== "your-ai" });
    },
  });
}
