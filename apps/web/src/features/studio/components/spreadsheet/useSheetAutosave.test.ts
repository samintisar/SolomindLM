import { act, renderHook } from "@testing-library/react";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RETRY_DELAY_MS, SAVE_DEBOUNCE_MS, useSheetAutosave } from "./useSheetAutosave";

type Props = { csv: string; serverCsv: string; enabled: boolean };

function deferred() {
  let resolve!: (value?: unknown) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<unknown>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** A `save` mock whose calls each return a promise the test settles by hand. */
function controllableSave() {
  const calls: ReturnType<typeof deferred>[] = [];
  const save = vi.fn((_csv: string) => {
    const d = deferred();
    calls.push(d);
    return d.promise;
  });
  return { save, calls };
}

function setup(initial: Partial<Props> = {}) {
  const { save, calls } = controllableSave();
  const onRejected = vi.fn();
  const hook = renderHook((props: Props) => useSheetAutosave({ ...props, save, onRejected }), {
    initialProps: { csv: "a", serverCsv: "a", enabled: true, ...initial },
  });
  const edit = (csv: string, extra: Partial<Props> = {}) =>
    hook.rerender({ csv, serverCsv: "a", enabled: true, ...extra });
  return { ...hook, save, calls, onRejected, edit };
}

async function settle(fn: () => void) {
  await act(async () => {
    fn();
  });
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe("useSheetAutosave", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("waits for the debounce, then saves the latest CSV once after quick changes", () => {
    const { save, edit } = setup();
    edit("b");
    advance(500);
    edit("c");
    advance(500);
    edit("d");
    advance(SAVE_DEBOUNCE_MS - 1);
    expect(save).not.toHaveBeenCalled();
    advance(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("d");
  });

  it("does not save when the CSV returns to the saved value", () => {
    const { save, edit, result } = setup();
    edit("b");
    advance(400);
    edit("a");
    advance(SAVE_DEBOUNCE_MS * 3);
    expect(save).not.toHaveBeenCalled();
    expect(result.current.state).toBe("idle");
  });

  it("goes idle, then saving, then saved", async () => {
    const { result, edit, calls } = setup();
    expect(result.current.state).toBe("idle");
    edit("b");
    expect(result.current.state).toBe("saving");
    advance(SAVE_DEBOUNCE_MS);
    expect(result.current.state).toBe("saving");
    await settle(() => calls[0].resolve());
    expect(result.current.state).toBe("saved");
  });

  it("saves the newest CSV after an in-flight save finishes, never two at once", async () => {
    const { result, save, edit, calls } = setup();
    edit("b");
    advance(SAVE_DEBOUNCE_MS);
    expect(save).toHaveBeenCalledTimes(1);
    edit("c");
    advance(SAVE_DEBOUNCE_MS);
    edit("d");
    advance(SAVE_DEBOUNCE_MS);
    expect(save).toHaveBeenCalledTimes(1);
    await settle(() => calls[0].resolve());
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith("d");
    expect(result.current.state).toBe("saving");
    await settle(() => calls[1].resolve());
    expect(result.current.state).toBe("saved");
  });

  it("retries once after a failure, and a successful retry shows saved", async () => {
    const { result, save, edit, calls } = setup();
    edit("b");
    advance(SAVE_DEBOUNCE_MS);
    await settle(() => calls[0].reject(new Error("network")));
    expect(result.current.state).toBe("error");
    advance(RETRY_DELAY_MS - 1);
    expect(save).toHaveBeenCalledTimes(1);
    advance(1);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith("b");
    await settle(() => calls[1].resolve());
    expect(result.current.state).toBe("saved");
  });

  it("stays in error after the automatic retry fails, until retry() saves again", async () => {
    const { result, save, edit, calls } = setup();
    edit("b");
    advance(SAVE_DEBOUNCE_MS);
    await settle(() => calls[0].reject(new Error("network")));
    advance(RETRY_DELAY_MS);
    await settle(() => calls[1].reject(new Error("network")));
    expect(result.current.state).toBe("error");
    advance(RETRY_DELAY_MS * 5);
    expect(save).toHaveBeenCalledTimes(2);
    expect(result.current.state).toBe("error");
    act(() => result.current.retry());
    expect(save).toHaveBeenCalledTimes(3);
    expect(save).toHaveBeenLastCalledWith("b");
    expect(result.current.state).toBe("saving");
    await settle(() => calls[2].resolve());
    expect(result.current.state).toBe("saved");
  });

  it("rolls back to the last CSV the server accepted when it rejects the data, without retrying", async () => {
    const { result, save, edit, calls, onRejected } = setup();
    edit("b");
    advance(SAVE_DEBOUNCE_MS);
    await settle(() => calls[0].resolve());
    edit("c");
    advance(SAVE_DEBOUNCE_MS);
    const error = new ConvexError({ type: "INPUT_VALIDATION_ERROR", detail: "too big" });
    await settle(() => calls[1].reject(error));
    expect(onRejected).toHaveBeenCalledTimes(1);
    expect(onRejected).toHaveBeenCalledWith("b", error);
    expect(result.current.state).toBe("saved");
    advance(RETRY_DELAY_MS * 5);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("rolls back to serverCsv when the server has accepted nothing yet", async () => {
    const { edit, calls, onRejected } = setup();
    edit("b");
    advance(SAVE_DEBOUNCE_MS);
    const error = new ConvexError({ type: "INPUT_VALIDATION_ERROR", detail: "too big" });
    await settle(() => calls[0].reject(error));
    expect(onRejected).toHaveBeenCalledWith("a", error);
  });

  it("flushes a pending debounced save on unmount with the latest CSV", () => {
    const { save, edit, unmount } = setup();
    edit("b");
    advance(100);
    edit("c");
    unmount();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("c");
    advance(SAVE_DEBOUNCE_MS * 5);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("saves an edit made during an in-flight save after it finishes, even once unmounted", async () => {
    const { save, edit, calls, unmount } = setup();
    edit("b");
    advance(SAVE_DEBOUNCE_MS);
    edit("c");
    unmount();
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => {
      calls[0].resolve();
    });
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith("c");
  });

  it("does not flush on unmount when nothing changed", () => {
    const { save, unmount } = setup();
    unmount();
    expect(save).not.toHaveBeenCalled();
  });

  it("flush() saves at once when a save is pending", () => {
    const { save, edit, result } = setup();
    edit("b");
    act(() => result.current.flush());
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("b");
    advance(SAVE_DEBOUNCE_MS * 2);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("never saves while disabled, not even on unmount", () => {
    const { save, edit, unmount } = setup({ enabled: false });
    edit("b", { enabled: false });
    advance(SAVE_DEBOUNCE_MS * 5);
    unmount();
    expect(save).not.toHaveBeenCalled();
  });

  it("saves once per edit under StrictMode", async () => {
    const { save, calls } = controllableSave();
    const { rerender, result } = renderHook(
      (props: Props) => useSheetAutosave({ ...props, save, onRejected: vi.fn() }),
      { initialProps: { csv: "a", serverCsv: "a", enabled: true }, reactStrictMode: true }
    );
    rerender({ csv: "b", serverCsv: "a", enabled: true });
    advance(SAVE_DEBOUNCE_MS);
    expect(save).toHaveBeenCalledTimes(1);
    await settle(() => calls[0].resolve());
    expect(result.current.state).toBe("saved");
  });

  it("does not treat a later serverCsv echo as a new edit", async () => {
    const { save, rerender, calls, result } = setup();
    rerender({ csv: "b", serverCsv: "a", enabled: true });
    advance(SAVE_DEBOUNCE_MS);
    await settle(() => calls[0].resolve());
    rerender({ csv: "b", serverCsv: "b", enabled: true });
    advance(SAVE_DEBOUNCE_MS * 3);
    expect(save).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBe("saved");
  });
});
