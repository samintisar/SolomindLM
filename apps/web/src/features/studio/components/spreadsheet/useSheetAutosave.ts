import { useCallback, useEffect, useRef, useState } from "react";
import { parseServiceError } from "@/shared/utils/errorParser";

/** Quiet time after the last edit before the sheet saves. */
export const SAVE_DEBOUNCE_MS = 800;
/** Delay before the one automatic retry after a failed save. */
export const RETRY_DELAY_MS = 3000;

export type SaveState = "idle" | "saving" | "saved" | "error";

export interface SheetAutosaveOptions {
  /** The CSV the sheet currently shows. A change schedules a save. */
  csv: string;
  /** The CSV last known to be on the server (from the query). */
  serverCsv: string;
  save: (csv: string) => Promise<unknown>;
  /** A save the server refused for good (validation): roll the sheet back to this CSV. */
  onRejected: (lastGoodCsv: string, error: unknown) => void;
  enabled: boolean;
}

/**
 * Debounced autosave for the spreadsheet sheet.
 *
 * - At most one save is in flight. An edit made meanwhile is saved, newest CSV
 *   only, once that save finishes.
 * - A save the server rejects as invalid rolls the sheet back through
 *   `onRejected` and is not retried. Any other failure is retried once after
 *   `RETRY_DELAY_MS`, then waits for `retry()` or the next edit.
 * - On unmount, an unsaved edit is saved at once (unless `enabled` is false).
 */
export function useSheetAutosave(options: SheetAutosaveOptions): {
  state: SaveState;
  retry: () => void;
  flush: () => void;
} {
  const { csv, serverCsv, enabled } = options;
  const [state, setState] = useState<SaveState>("idle");

  // Latest props, readable from timers, promise callbacks and the unmount flush.
  const csvRef = useRef(csv);
  csvRef.current = csv;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const saveRef = useRef(options.save);
  saveRef.current = options.save;
  const onRejectedRef = useRef(options.onRejected);
  onRejectedRef.current = options.onRejected;

  /** The CSV the server is known to hold: what it last accepted, else `serverCsv`. */
  const confirmedRef = useRef(serverCsv);
  /** The debounce or retry timer, whichever is waiting. */
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The save in flight, if any, and the CSV it carries. */
  const inFlightRef = useRef<{ csv: string; promise: Promise<unknown> } | null>(null);
  /** Whether the current run of failures may still retry by itself. */
  const autoRetryLeftRef = useRef(true);
  /** Whether `state` should rest at "saved" (rather than "idle") when nothing is pending. */
  const hasSavedRef = useRef(false);
  const isMountedRef = useRef(false);

  const setStateIfMounted = useCallback((next: SaveState) => {
    if (isMountedRef.current) setState(next);
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /** Nothing pending: show the result of the last save, or nothing before any. */
  const settle = useCallback(() => {
    setStateIfMounted(hasSavedRef.current ? "saved" : "idle");
  }, [setStateIfMounted]);

  // `startSave`, its callbacks and the timers call each other; timers go through this ref.
  const attemptRef = useRef<() => void>(() => {});

  const startSave = useCallback(
    (value: string) => {
      setStateIfMounted("saving");
      let promise: Promise<unknown>;
      try {
        promise = saveRef.current(value);
      } catch (error) {
        promise = Promise.reject(error);
      }
      inFlightRef.current = { csv: value, promise };
      promise.then(
        () => {
          inFlightRef.current = null;
          confirmedRef.current = value;
          hasSavedRef.current = true;
          autoRetryLeftRef.current = true;
          // After unmount the cleanup has already chained any newer edit.
          if (!isMountedRef.current) return;
          // A newer edit still in its debounce saves when its timer fires.
          if (timerRef.current !== null) return;
          if (enabledRef.current && csvRef.current !== confirmedRef.current) {
            startSave(csvRef.current);
          } else {
            setState("saved");
          }
        },
        (error: unknown) => {
          inFlightRef.current = null;
          if (!isMountedRef.current) {
            console.error("Failed to save the spreadsheet after it closed:", error);
            return;
          }
          if (parseServiceError(error)?.kind === "input_validation") {
            clearTimer();
            // Once the sheet rolls back, nothing is pending and it matches the server.
            hasSavedRef.current = true;
            onRejectedRef.current(confirmedRef.current, error);
            setState("saved");
            return;
          }
          // A newer edit is waiting for its debounce: it will try with the newest CSV.
          if (timerRef.current !== null) return;
          if (!enabledRef.current || csvRef.current === confirmedRef.current) {
            settle();
            return;
          }
          // A newer edit queued behind this save gets its own attempt now.
          if (csvRef.current !== value) {
            startSave(csvRef.current);
            return;
          }
          setState("error");
          if (autoRetryLeftRef.current) {
            autoRetryLeftRef.current = false;
            timerRef.current = setTimeout(() => attemptRef.current(), RETRY_DELAY_MS);
          }
        }
      );
    },
    [clearTimer, setStateIfMounted, settle]
  );

  /** Save the latest CSV now, unless the server has it or a save is in flight. */
  const attempt = useCallback(() => {
    timerRef.current = null;
    if (!enabledRef.current) {
      settle();
      return;
    }
    // The in-flight save's completion picks up the newest CSV.
    if (inFlightRef.current) return;
    if (csvRef.current === confirmedRef.current) {
      settle();
      return;
    }
    startSave(csvRef.current);
  }, [settle, startSave]);
  attemptRef.current = attempt;

  // The server's copy changed (our own echo, or an edit elsewhere): it is the
  // new baseline, except while our save is in flight, whose result decides.
  // Declared before the edit effect so a matching `csv` in the same render is not saved.
  useEffect(() => {
    if (!inFlightRef.current) confirmedRef.current = serverCsv;
  }, [serverCsv]);

  // An edit (re)starts the debounce; returning to the server's CSV cancels it.
  useEffect(() => {
    if (!enabled || csv === confirmedRef.current) {
      clearTimer();
      if (!inFlightRef.current) settle();
      return;
    }
    autoRetryLeftRef.current = true;
    clearTimer();
    setState("saving");
    timerRef.current = setTimeout(() => attemptRef.current(), SAVE_DEBOUNCE_MS);
  }, [csv, enabled, clearTimer, settle]);

  // Unmount: stop the timers and save an unsaved edit at once, newest CSV only.
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      clearTimer();
      if (!enabledRef.current) return;
      const latest = csvRef.current;
      const inFlight = inFlightRef.current;
      if (!inFlight) {
        if (latest !== confirmedRef.current) startSave(latest);
        return;
      }
      if (inFlight.csv === latest) return;
      // Keep one save at a time: send the newest CSV once this one settles.
      void inFlight.promise
        .catch(() => undefined)
        .then(() => {
          // Remounted meanwhile (StrictMode): the live hook takes it from here.
          if (isMountedRef.current || inFlightRef.current) return;
          if (confirmedRef.current !== latest) startSave(latest);
        });
    };
  }, [clearTimer, startSave]);

  const flush = useCallback(() => {
    clearTimer();
    attempt();
  }, [attempt, clearTimer]);

  const retry = useCallback(() => {
    autoRetryLeftRef.current = true;
    clearTimer();
    attempt();
  }, [attempt, clearTimer]);

  return { state, retry, flush };
}
