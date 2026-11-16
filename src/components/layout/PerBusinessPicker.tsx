import { Building2 } from "lucide-react";

import { useOrg } from "@/lib/org-context";

/**
 * For pages whose settings or numbers belong to ONE business: when the top bar is on
 * "All companies", say which business is shown and let the owner switch, instead of quietly
 * showing (and editing) the first one. Picking a business here selects it app-wide, like the
 * top bar does. Renders nothing for single-business accounts or when a business is selected.
 */
export function PerBusinessPicker({
  companies,
  shownCompanyId,
  what,
}: {
  companies: Array<{ id: string; name: string }> | undefined;
  /** The business the page is showing now (the first one, under "All companies"). */
  shownCompanyId: string | null;
  /** e.g. "These settings" / "This report". */
  what: string;
}) {
  const { companyId, setCompanyId } = useOrg();
  if (companyId || !companies || companies.length < 2) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm">
      <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
      <span className="text-muted-foreground">{what} are for one business at a time. Showing:</span>
      <select
        aria-label="Business"
        value={shownCompanyId ?? ""}
        onChange={(e) => setCompanyId(e.target.value || null)}
        className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
      >
        {companies.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}
