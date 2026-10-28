/**
 * React wiring for AutosaveController (src/lib/autosave.ts).
 *
 *   const autosave = useAutosave({ enabled, fingerprint, save, warnOnLeave });
 *
 * - Each new `fingerprint` (while `enabled`) schedules a save after a quiet period.
 * - The tab going to the background saves right away; unmounting (closing the dialog, the
 *   browser back button) saves whatever is unsaved.
 * - While something is unsaved or saving — or `warnOnLeave` — closing/reloading the tab asks
 *   the browser's "leave site?" question.
 */
import { useEffect, useRef, useState } from "react";

import { AutosaveController, type AutosaveState } from "@/lib/autosave";

export interface UseAutosaveOptions {
  enabled: boolean;
  fingerprint: string;
  save: () => Promise<void>;
  delayMs?: number;
  /** Ask before the tab closes even when autosave is off (e.g. unsaved edits to a sent invoice). */
  warnOnLeave?: boolean;
}

export interface UseAutosave {
  state: AutosaveState;
  controller: AutosaveController;
  flush: () => Promise<void>;
  markSaved: (fingerprint: string) => void;
}

export function useAutosave({ enabled, fingerprint, save, delayMs, warnOnLeave = false }: UseAutosaveOptions): UseAutosave {
  const saveRef = useRef(save);
  saveRef.current = save;
  const [state, setState] = useState<AutosaveState>({ status: "idle", savedAt: null, message: null });
  const ref = useRef<AutosaveController | null>(null);
  if (!ref.current) {
    ref.current = new AutosaveController({ save: () => saveRef.current(), delayMs, onState: setState });
    ref.current.baseline(fingerprint);
  }
  const controller = ref.current;
  const generation = useRef(0);
  const warnRef = useRef(warnOnLeave);
  warnRef.current = warnOnLeave;

  useEffect(() => {
    if (enabled) controller.change(fingerprint);
  }, [controller, enabled, fingerprint]);

  useEffect(() => {
    generation.current += 1;
    controller.resume();
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (controller.dirty || controller.busy || warnRef.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") void controller.flush();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onVisibility);
      // Unmount (dialog closed, route changed): save what's left, then stop retrying — unless
      // it was mounted again meanwhile (React StrictMode in dev).
      const gen = generation.current;
      void controller.flush().finally(() => {
        if (generation.current === gen) controller.stop();
      });
    };
  }, [controller]);

  return { state, controller, flush: () => controller.flush(), markSaved: (fp) => controller.markSaved(fp) };
}
