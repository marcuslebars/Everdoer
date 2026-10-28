/**
 * Autosave for forms (first user: the invoice editor). Framework-free so it can be tested with
 * fake timers; `useAutosave` (components/invoices/useAutosave.ts) wires it into React.
 *
 *   change(fingerprint) → wait `delayMs` of quiet → save() → "saved"
 *
 * - One save at a time. A change during a save is saved right after it finishes.
 * - A failed save retries with backoff (RETRY_DELAYS_MS) as long as there's something unsaved.
 * - A save may reject with AutosaveSkip("reason") when the form can't be saved yet (e.g. a
 *   number that can't be read): status "invalid", no retry until the next change.
 * - flush() saves now (if anything is unsaved) and resolves when nothing is in flight.
 */

export type AutosaveStatus = "idle" | "pending" | "saving" | "saved" | "error" | "invalid";

export interface AutosaveState {
  status: AutosaveStatus;
  /** When the last save finished (epoch ms). */
  savedAt: number | null;
  /** The error / skip reason for "error" / "invalid". */
  message: string | null;
}

/** Thrown by a save that can't run yet; not retried until the form changes. */
export class AutosaveSkip extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AutosaveSkip";
  }
}

export const RETRY_DELAYS_MS = [3_000, 10_000, 30_000, 60_000];

export interface AutosaveOptions {
  /** Saves the CURRENT form (read it from a ref, not a stale closure). */
  save: () => Promise<void>;
  delayMs?: number;
  onState?: (state: AutosaveState) => void;
  now?: () => number;
}

export class AutosaveController {
  private readonly save: () => Promise<void>;
  private readonly delayMs: number;
  private readonly onState?: (state: AutosaveState) => void;
  private readonly now: () => number;

  /** What the form looks like now, and what was last saved successfully. */
  private current: string | null = null;
  private saved: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight: Promise<void> | null = null;
  private retries = 0;
  private stopped = false;
  private state: AutosaveState = { status: "idle", savedAt: null, message: null };

  constructor(options: AutosaveOptions) {
    this.save = options.save;
    this.delayMs = options.delayMs ?? 1_500;
    this.onState = options.onState;
    this.now = options.now ?? Date.now;
  }

  /** The starting point (already saved): changes are measured against it. */
  baseline(fingerprint: string): void {
    this.current = fingerprint;
    this.saved = fingerprint;
  }

  /** Mark this fingerprint as saved by someone else (e.g. an explicit Save). */
  markSaved(fingerprint: string): void {
    this.saved = fingerprint;
    if (this.current === fingerprint) {
      this.clearTimer();
      this.retries = 0;
      this.set({ status: "saved", savedAt: this.now(), message: null });
    }
  }

  get dirty(): boolean {
    return this.current !== this.saved;
  }

  get busy(): boolean {
    return this.inFlight !== null;
  }

  getState(): AutosaveState {
    return this.state;
  }

  change(fingerprint: string): void {
    if (this.stopped) return;
    this.current = fingerprint;
    if (!this.dirty) {
      this.clearTimer();
      if (!this.inFlight && this.state.status === "pending") this.set({ ...this.state, status: this.state.savedAt ? "saved" : "idle", message: null });
      return;
    }
    this.retries = 0;
    if (!this.inFlight) this.set({ ...this.state, status: "pending", message: null });
    this.schedule(this.delayMs);
  }

  /** Save now if anything is unsaved; resolves once nothing is in flight. Never rejects. */
  async flush(): Promise<void> {
    this.clearTimer();
    while (this.inFlight) await this.inFlight;
    if (this.dirty && !this.stopped) await this.run();
  }

  /** Undo stop() (React StrictMode mounts, unmounts and mounts again). */
  resume(): void {
    this.stopped = false;
  }

  /** Stop timers (unmount). An in-flight save still finishes. */
  stop(): void {
    this.stopped = true;
    this.clearTimer();
  }

  private schedule(ms: number): void {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.run();
    }, ms);
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private set(state: AutosaveState): void {
    this.state = state;
    this.onState?.(state);
  }

  private run(): Promise<void> {
    if (this.inFlight) return this.inFlight;
    if (!this.dirty) return Promise.resolve();
    const attempt = this.current;
    this.set({ ...this.state, status: "saving", message: null });
    this.inFlight = (async () => {
      try {
        await this.save();
        this.saved = attempt;
        this.retries = 0;
        this.set({ status: this.dirty ? "pending" : "saved", savedAt: this.now(), message: null });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Couldn't save.";
        if (err instanceof AutosaveSkip) {
          this.set({ ...this.state, status: "invalid", message });
          return;
        }
        this.set({ ...this.state, status: "error", message });
        if (!this.stopped && this.dirty) {
          const delay = RETRY_DELAYS_MS[Math.min(this.retries, RETRY_DELAYS_MS.length - 1)];
          this.retries += 1;
          this.schedule(delay);
        }
        return;
      } finally {
        this.inFlight = null;
      }
      // Changed while saving: save again after the usual quiet period.
      if (this.dirty && !this.stopped) this.schedule(this.delayMs);
    })();
    return this.inFlight;
  }
}
