import { renderHook } from "@testing-library/react";
import { toast as sonner } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/shared/contexts/ToastContext";
import { useToast } from "@/shared/contexts/useToast";

vi.mock("sonner", () => {
  const toast = Object.assign(
    vi.fn(() => "id-default"),
    {
      success: vi.fn(() => "id-success"),
      error: vi.fn(() => "id-error"),
      info: vi.fn(() => 7),
      loading: vi.fn(() => "id-loading"),
      dismiss: vi.fn(),
    }
  );
  return { toast };
});

function renderToastHook() {
  return renderHook(() => useToast(), { wrapper: ToastProvider });
}

describe("ToastProvider (sonner adapter)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when useToast is used outside provider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useToast())).toThrow(
      "useToast must be used within a ToastProvider"
    );
    spy.mockRestore();
  });

  it("success uses the default 4000ms duration and returns the id", () => {
    const { result } = renderToastHook();
    expect(result.current.success("Done!")).toBe("id-success");
    expect(sonner.success).toHaveBeenCalledWith(
      "Done!",
      expect.objectContaining({ duration: 4000 })
    );
  });

  it("error defaults to 6000ms and respects an override", () => {
    const { result } = renderToastHook();
    result.current.error("Failed");
    expect(sonner.error).toHaveBeenLastCalledWith(
      "Failed",
      expect.objectContaining({ duration: 6000 })
    );
    result.current.error("Failed", { duration: 3000 });
    expect(sonner.error).toHaveBeenLastCalledWith(
      "Failed",
      expect.objectContaining({ duration: 3000 })
    );
  });

  it("loading never auto-dismisses, even when a duration is passed", () => {
    const { result } = renderToastHook();
    result.current.loading("Working", { duration: 1000 });
    expect(sonner.loading).toHaveBeenCalledWith(
      "Working",
      expect.objectContaining({ duration: Infinity })
    );
  });

  it("toast() defaults to info and stringifies numeric ids", () => {
    const { result } = renderToastHook();
    expect(result.current.toast("Hello")).toBe("7");
    expect(sonner.info).toHaveBeenCalledWith("Hello", expect.objectContaining({ duration: 4000 }));
  });

  it("toast() routes by type", () => {
    const { result } = renderToastHook();
    result.current.toast("Saved", { type: "success" });
    expect(sonner.success).toHaveBeenCalledWith("Saved", expect.anything());
  });

  it("passes id and action through", () => {
    const { result } = renderToastHook();
    const onClick = vi.fn();
    result.current.info("Undo?", { id: "undo-1", action: { label: "Undo", onClick } });
    expect(sonner.info).toHaveBeenCalledWith(
      "Undo?",
      expect.objectContaining({ id: "undo-1", action: { label: "Undo", onClick } })
    );
  });

  it("dismiss forwards to sonner", () => {
    const { result } = renderToastHook();
    result.current.dismiss("id-loading");
    expect(sonner.dismiss).toHaveBeenCalledWith("id-loading");
  });
});
