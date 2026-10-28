import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AutosaveController, AutosaveSkip, RETRY_DELAYS_MS, type AutosaveState } from "@/lib/autosave";
import { allBackupKeys, backupKey, clearBackup, fingerprint, MAX_AGE_MS, readBackup, writeBackup, type InvoiceFormSnapshot } from "@/lib/invoice-draft-backup";
import { allAppLocalStorageKeys } from "@/lib/storage-keys";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup(save: () => Promise<void> = async () => undefined) {
  const states: AutosaveState[] = [];
  const fn = vi.fn(save);
  const c = new AutosaveController({ save: fn, delayMs: 1_000, onState: (s) => states.push(s) });
  c.baseline("a");
  return { c, fn, states, last: () => states.at(-1) };
}

describe("AutosaveController", () => {
  it("saves once after a quiet period, coalescing quick changes", async () => {
    const { c, fn, last } = setup();
    c.change("b");
    await vi.advanceTimersByTimeAsync(500);
    c.change("c");
    await vi.advanceTimersByTimeAsync(999);
    expect(fn).not.toHaveBeenCalled();
    expect(last()?.status).toBe("pending");
    await vi.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(last()?.status).toBe("saved");
    expect(c.dirty).toBe(false);
  });

  it("nothing changed (back to the baseline) → no save", async () => {
    const { c, fn } = setup();
    c.change("b");
    c.change("a");
    await vi.advanceTimersByTimeAsync(5_000);
    expect(fn).not.toHaveBeenCalled();
  });

  it("a change during a save is saved after it (one save at a time)", async () => {
    let release: () => void = () => undefined;
    const { c, fn, last } = setup(() => new Promise<void>((r) => (release = r)));
    c.change("b");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fn).toHaveBeenCalledTimes(1);
    c.change("c");
    await vi.advanceTimersByTimeAsync(5_000);
    expect(fn).toHaveBeenCalledTimes(1); // still waiting on the first
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(last()?.status).toBe("pending");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fn).toHaveBeenCalledTimes(2);
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(c.dirty).toBe(false);
  });

  it("a failed save retries with backoff while something is unsaved", async () => {
    let fail = true;
    const { c, fn, last } = setup(async () => {
      if (fail) throw new Error("offline");
    });
    c.change("b");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(last()).toMatchObject({ status: "error", message: "offline" });
    await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0]);
    expect(fn).toHaveBeenCalledTimes(2);
    fail = false;
    await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[1]);
    expect(fn).toHaveBeenCalledTimes(3);
    expect(last()?.status).toBe("saved");
  });

  it("AutosaveSkip → 'invalid', no retry until the next change", async () => {
    const { c, fn, last } = setup(async () => {
      throw new AutosaveSkip("Line 1: quantity must be above zero.");
    });
    c.change("b");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(last()).toMatchObject({ status: "invalid", message: "Line 1: quantity must be above zero." });
    await vi.advanceTimersByTimeAsync(120_000);
    expect(fn).toHaveBeenCalledTimes(1);
    c.change("c");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("flush saves right away and waits for a save in flight", async () => {
    const { c, fn } = setup();
    c.change("b");
    await c.flush();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(c.dirty).toBe(false);
    await c.flush(); // nothing unsaved → no save
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("markSaved (an explicit Save) cancels the pending autosave", async () => {
    const { c, fn, last } = setup();
    c.change("b");
    c.markSaved("b");
    await vi.advanceTimersByTimeAsync(5_000);
    expect(fn).not.toHaveBeenCalled();
    expect(last()?.status).toBe("saved");
  });

  it("stop() ends retries; resume() brings it back", async () => {
    const { c, fn } = setup(async () => {
      throw new Error("offline");
    });
    c.change("b");
    await vi.advanceTimersByTimeAsync(1_000);
    c.stop();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(fn).toHaveBeenCalledTimes(1);
    c.resume();
    c.change("c");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe("invoice draft backup (this browser)", () => {
  const form: InvoiceFormSnapshot = {
    companyId: "co-1",
    customerType: "person",
    contactId: null,
    contactLabel: "",
    accountId: "",
    title: "Shrink wrap",
    lines: [{ label: "Wrap", description: "", showDetails: false, quantity: "1", unitPrice: "520" }],
    taxPct: "13",
    credit: "",
    terms: "default",
    dueDate: "",
    notes: "",
    internalNotes: "",
    billToAddress: "",
  };

  beforeEach(() => window.localStorage.clear());

  it("round-trips, per org + invoice ('new' before the first save)", () => {
    const key = backupKey("org-1", null);
    expect(key).toBe("everdoer_invoice_draft:org-1:new");
    writeBackup(key, { form, savedAt: Date.now(), invoiceId: null });
    expect(readBackup(key)).toEqual({ form, savedAt: Date.now(), invoiceId: null });
    expect(readBackup(backupKey("org-1", "inv-1"))).toBeNull();
    clearBackup(key);
    expect(readBackup(key)).toBeNull();
  });

  it("drops stale or malformed entries", () => {
    const key = backupKey("org-1", "inv-1");
    writeBackup(key, { form, savedAt: Date.now() - MAX_AGE_MS - 1, invoiceId: null });
    expect(readBackup(key)).toBeNull();
    expect(window.localStorage.getItem(key)).toBeNull();
    window.localStorage.setItem(key, "{not json");
    expect(readBackup(key)).toBeNull();
    window.localStorage.setItem(key, JSON.stringify({ form: { nope: 1 }, savedAt: Date.now() }));
    expect(readBackup(key)).toBeNull();
  });

  it("fingerprints compare forms; sign-out clears every backup", () => {
    expect(fingerprint(form)).toBe(fingerprint({ ...form }));
    expect(fingerprint(form)).not.toBe(fingerprint({ ...form, title: "Other" }));
    writeBackup(backupKey("org-1", "inv-1"), { form, savedAt: Date.now(), invoiceId: null });
    writeBackup(backupKey("org-2", null), { form, savedAt: Date.now(), invoiceId: null });
    expect(allBackupKeys().sort()).toEqual(["everdoer_invoice_draft:org-1:inv-1", "everdoer_invoice_draft:org-2:new"]);
    expect(allAppLocalStorageKeys()).toEqual(expect.arrayContaining(allBackupKeys()));
  });
});
