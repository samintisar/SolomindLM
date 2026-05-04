import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { ToastProvider } from "@/shared/contexts/ToastContext";
import { useToast } from "@/shared/contexts/useToast";

describe("ToastProvider", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function renderToastHook() {
    return renderHook(() => useToast(), { wrapper: ToastProvider });
  }

  it("throws when useToast is used outside provider", () => {
    // Suppress console.error for expected error
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useToast())).toThrow(
      "useToast must be used within a ToastProvider"
    );
    spy.mockRestore();
  });

  it("starts with empty toasts", () => {
    const { result } = renderToastHook();
    expect(result.current.toasts).toEqual([]);
  });

  it("adds a toast with default type info", () => {
    const { result } = renderToastHook();
    act(() => {
      result.current.toast("Hello");
    });
    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].message).toBe("Hello");
    expect(result.current.toasts[0].type).toBe("info");
  });

  it("adds a success toast", () => {
    const { result } = renderToastHook();
    act(() => {
      result.current.success("Done!");
    });
    expect(result.current.toasts[0].type).toBe("success");
    expect(result.current.toasts[0].message).toBe("Done!");
  });

  it("adds an error toast with 6000ms default duration", () => {
    const { result } = renderToastHook();
    act(() => {
      result.current.error("Something failed");
    });
    expect(result.current.toasts[0].type).toBe("error");
    expect(result.current.toasts[0].duration).toBe(6000);
  });

  it("allows error toast with custom duration", () => {
    const { result } = renderToastHook();
    act(() => {
      result.current.error("Error", { duration: 3000 });
    });
    expect(result.current.toasts[0].duration).toBe(3000);
  });

  it("adds a loading toast with infinite duration", () => {
    const { result } = renderToastHook();
    act(() => {
      result.current.loading("Loading...");
    });
    expect(result.current.toasts[0].type).toBe("loading");
    expect(result.current.toasts[0].duration).toBe(Infinity);
  });

  it("auto-dismisses non-loading toasts after duration", () => {
    const { result } = renderToastHook();
    act(() => {
      result.current.toast("Temporary");
    });
    expect(result.current.toasts).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(result.current.toasts).toHaveLength(0);
  });

  it("does not auto-dismiss loading toasts", () => {
    const { result } = renderToastHook();
    act(() => {
      result.current.loading("Still loading");
    });

    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(result.current.toasts).toHaveLength(1);
  });

  it("dismisses a toast by id", () => {
    const { result } = renderToastHook();
    act(() => {
      result.current.toast("Keep");
      result.current.success("Remove me");
    });
    expect(result.current.toasts).toHaveLength(2);

    act(() => {
      result.current.dismiss(result.current.toasts[1].id);
    });
    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].message).toBe("Keep");
  });

  it("supports custom duration override", () => {
    const { result } = renderToastHook();
    act(() => {
      result.current.toast("Custom", { duration: 1000 });
    });

    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(result.current.toasts).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.toasts).toHaveLength(0);
  });

  it("supports action in toast", () => {
    const { result } = renderToastHook();
    const onClick = vi.fn();
    act(() => {
      result.current.toast("Undo?", { action: { label: "Undo", onClick } });
    });
    expect(result.current.toasts[0].action?.label).toBe("Undo");
    expect(result.current.toasts[0].action?.onClick).toBe(onClick);
  });

  it("returns toast id from toast methods", () => {
    const { result } = renderToastHook();
    act(() => {
      const _id = result.current.toast("test");
      expect(_id).toBeTruthy();
    });
  });
});
