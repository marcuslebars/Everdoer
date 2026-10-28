/**
 * A copy of the invoice being edited, kept in this browser (localStorage) so nothing typed is
 * lost to a refresh, a closed tab, the back button or a dropped connection — including on a
 * sent invoice, which isn't autosaved to the server (that would change the customer's copy).
 *
 * One entry per org + invoice ("new" before a new invoice's first save). Entries older than
 * MAX_AGE_MS are ignored and removed; sign-out clears them all (storage-keys.ts). Every access
 * is wrapped: a private window or blocked storage just means no backup.
 */

export const BACKUP_PREFIX = "everdoer_invoice_draft:";
export const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export interface InvoiceFormLine {
  label: string;
  description: string;
  showDetails: boolean;
  quantity: string;
  unitPrice: string;
}

/** Everything the editor holds (the line keys are React-only and not part of it). */
export interface InvoiceFormSnapshot {
  companyId: string;
  customerType: "person" | "business";
  contactId: string | null;
  contactLabel: string;
  accountId: string;
  title: string;
  lines: InvoiceFormLine[];
  taxPct: string;
  credit: string;
  terms: string;
  dueDate: string;
  notes: string;
  internalNotes: string;
  billToAddress: string;
}

export interface InvoiceBackup {
  form: InvoiceFormSnapshot;
  savedAt: number;
  /** The draft an autosave created for a "new" entry, if any. */
  invoiceId: string | null;
}

/** A stable string for comparing forms. PURE. */
export function fingerprint(form: InvoiceFormSnapshot): string {
  return JSON.stringify(form);
}

/** Does a NEW invoice have anything worth saving yet (beyond the defaults)? PURE. */
export function hasContent(form: InvoiceFormSnapshot): boolean {
  return Boolean(
    form.title.trim() ||
      form.contactId ||
      form.accountId ||
      form.credit.trim() ||
      form.notes.trim() ||
      form.internalNotes.trim() ||
      form.billToAddress.trim() ||
      form.dueDate ||
      form.terms !== "default" ||
      form.taxPct !== "13" ||
      form.lines.some((l) => l.label.trim() || l.unitPrice.trim() || l.description.trim() || (l.quantity.trim() !== "" && l.quantity.trim() !== "1")),
  );
}

export function backupKey(orgId: string, invoiceId: string | null): string {
  return `${BACKUP_PREFIX}${orgId}:${invoiceId ?? "new"}`;
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function isSnapshot(value: unknown): value is InvoiceFormSnapshot {
  const v = value as Partial<InvoiceFormSnapshot> | null;
  return Boolean(v && typeof v === "object" && typeof v.companyId === "string" && Array.isArray(v.lines) && typeof v.title === "string");
}

export function readBackup(key: string, now = Date.now()): InvoiceBackup | null {
  const s = storage();
  if (!s) return null;
  try {
    const raw = s.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<InvoiceBackup>;
    if (!isSnapshot(parsed.form) || typeof parsed.savedAt !== "number" || now - parsed.savedAt > MAX_AGE_MS) {
      s.removeItem(key);
      return null;
    }
    return { form: parsed.form, savedAt: parsed.savedAt, invoiceId: typeof parsed.invoiceId === "string" ? parsed.invoiceId : null };
  } catch {
    return null;
  }
}

export function writeBackup(key: string, backup: InvoiceBackup): void {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(key, JSON.stringify(backup));
  } catch {
    /* quota / blocked: no backup this time */
  }
}

export function clearBackup(key: string): void {
  const s = storage();
  if (!s) return;
  try {
    s.removeItem(key);
  } catch {
    /* storage unavailable */
  }
}

/** Every backup key in this browser (sign-out). */
export function allBackupKeys(): string[] {
  const s = storage();
  if (!s) return [];
  const keys: string[] = [];
  try {
    for (let i = 0; i < s.length; i++) {
      const key = s.key(i);
      if (key?.startsWith(BACKUP_PREFIX)) keys.push(key);
    }
  } catch {
    /* storage unavailable */
  }
  return keys;
}
