/** Home ("Today") page: the pure pieces, tested in src/test/simple-nav.test.tsx. */
import type { BookingCalendarRow } from "@/lib/api-client";
import { formatCentsCompact } from "@/lib/format";

/** "Good morning" / "Good afternoon" / "Good evening". PURE. */
export function greetingFor(date: Date): string {
  const h = date.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/** Today's jobs worth showing: not cancelled, earliest first. PURE. */
export function todaysJobs(rows: BookingCalendarRow[]): BookingCalendarRow[] {
  return rows
    .filter((b) => b.status !== "cancelled")
    .slice()
    .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
}

export interface NeedsYouItem {
  key: string;
  label: string;
  to: string;
  tone: "warn" | "info";
}

/** The short "needs you" list from the day's numbers. Empty means all caught up. PURE. */
export function needsYouItems(input: {
  newLeadCount?: number;
  overdueTaskCount?: number;
  overdueInvoiceCount?: number;
  overdueCents?: number;
}): NeedsYouItem[] {
  const items: NeedsYouItem[] = [];
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  if (input.newLeadCount && input.newLeadCount > 0) {
    items.push({ key: "leads", label: `${plural(input.newLeadCount, "new lead", "new leads")} to look at`, to: "/crm", tone: "info" });
  }
  if (input.overdueInvoiceCount && input.overdueInvoiceCount > 0) {
    const amount = input.overdueCents ? ` (${formatCentsCompact(input.overdueCents)})` : "";
    items.push({
      key: "invoices",
      label: `${plural(input.overdueInvoiceCount, "overdue invoice", "overdue invoices")}${amount}`,
      to: "/invoices?filter=overdue",
      tone: "warn",
    });
  }
  if (input.overdueTaskCount && input.overdueTaskCount > 0) {
    items.push({ key: "tasks", label: `${plural(input.overdueTaskCount, "overdue task", "overdue tasks")}`, to: "/tasks", tone: "warn" });
  }
  return items;
}

