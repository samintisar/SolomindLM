import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { AiConsentState } from "./resolveAiConsentState";
import { useReportAiConsentToShell } from "./useReportAiConsentToShell";

const postMessage = vi.fn();
vi.mock("@/utils/platformDetection", () => ({
  getNativeWebViewBridge: () => ({ postMessage }),
}));

const message = (granted: boolean) => JSON.stringify({ type: "shell-web:ai-consent", granted });

describe("useReportAiConsentToShell", () => {
  beforeEach(() => {
    postMessage.mockClear();
  });

  test.each([
    ["granted", true],
    ["needsConsent", false],
    ["declined", false],
  ] as const)("%s posts granted:%s", (state, granted) => {
    renderHook(() => useReportAiConsentToShell(state));
    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith(message(granted));
  });

  test.each(["loading", "notApplicable"] as const)("%s posts nothing", (state) => {
    renderHook(() => useReportAiConsentToShell(state));
    expect(postMessage).not.toHaveBeenCalled();
  });

  test("does not re-post when the state changes but the boolean does not", () => {
    const { rerender } = renderHook(({ state }) => useReportAiConsentToShell(state), {
      initialProps: { state: "needsConsent" as AiConsentState },
    });
    rerender({ state: "declined" });
    rerender({ state: "declined" });
    expect(postMessage).toHaveBeenCalledTimes(1);
  });

  test("re-posts when the boolean flips", () => {
    const { rerender } = renderHook(({ state }) => useReportAiConsentToShell(state), {
      initialProps: { state: "needsConsent" as AiConsentState },
    });
    rerender({ state: "granted" });
    rerender({ state: "declined" });
    // needsConsent, granted, then granted's cleanup (false) and the declined effect (false).
    expect(postMessage.mock.calls.map(([m]) => m)).toEqual([
      message(false),
      message(true),
      message(false),
      message(false),
    ]);
  });

  test("unmounting after granted posts false", () => {
    const { unmount } = renderHook(() => useReportAiConsentToShell("granted"));
    unmount();
    expect(postMessage.mock.calls.map(([m]) => m)).toEqual([message(true), message(false)]);
  });

  test("unmounting after needsConsent posts nothing extra", () => {
    const { unmount } = renderHook(() => useReportAiConsentToShell("needsConsent"));
    unmount();
    expect(postMessage.mock.calls.map(([m]) => m)).toEqual([message(false)]);
  });
});
