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

  it("success uses the default 4000ms duration and returns the id it passed", () => {
    const { result } = renderToastHook();
    const id = result.current.success("Done!");
    expect(sonner.success).toHaveBeenCalledWith(
      "Done!",
      expect.objectContaining({ duration: 4000, id })
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

  it("toast() defaults to info and passes a generated string id that it returns", () => {
    const { result } = renderToastHook();
    const returned = result.current.toast("Hello");
    expect(sonner.info).toHaveBeenCalledWith(
      "Hello",
      expect.objectContaining({ duration: 4000, id: expect.any(String) })
    );
    const passedId = vi.mocked(sonner.info).mock.calls[0][1]?.id;
    expect(typeof passedId).toBe("string");
    expect(returned).toBe(passedId);
  });

  it("generates a different id for each call without an id", () => {
    const { result } = renderToastHook();
    const first = result.current.info("A");
    const second = result.current.info("B");
    expect(first).not.toBe(second);
  });

  it("loading() then dismiss(returnedId) dismisses exactly the id given to sonner", () => {
    const { result } = renderToastHook();
    const returned = result.current.loading("Working");
    const passedId = vi.mocked(sonner.loading).mock.calls[0][1]?.id;
    expect(returned).toBe(passedId);
    result.current.dismiss(returned);
    expect(sonner.dismiss).toHaveBeenCalledWith(passedId);
  });

  it("toast() routes by type", () => {
    const { result } = renderToastHook();
    result.current.toast("Saved", { type: "success" });
    expect(sonner.success).toHaveBeenCalledWith("Saved", expect.anything());
  });

  it("passes id and action through, keeping the toast open on action click", () => {
    const { result } = renderToastHook();
    const onClick = vi.fn();
    result.current.info("Undo?", { id: "undo-1", action: { label: "Undo", onClick } });
    expect(sonner.info).toHaveBeenCalledWith(
      "Undo?",
      expect.objectContaining({ id: "undo-1", action: expect.objectContaining({ label: "Undo" }) })
    );
    const passedAction = vi.mocked(sonner.info).mock.calls[0][1]?.action as unknown as {
      onClick: (event: { preventDefault: () => void }) => void;
    };
    const preventDefault = vi.fn();
    passedAction.onClick({ preventDefault });
    expect(onClick).toHaveBeenCalledOnce();
    expect(preventDefault).toHaveBeenCalledOnce();
  });

  it("dismiss forwards to sonner", () => {
    const { result } = renderToastHook();
    result.current.dismiss("id-loading");
    expect(sonner.dismiss).toHaveBeenCalledWith("id-loading");
  });
});
