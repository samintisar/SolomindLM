// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { captureFeedbackContext, validateFeedbackDraft } from "./feedbackTypes";

afterEach(() => {
  delete (window as { __IS_NATIVE_SHELL__?: boolean }).__IS_NATIVE_SHELL__;
});

describe("captureFeedbackContext", () => {
  it("captures route + search and defaults surface to web", () => {
    const ctx = captureFeedbackContext({ pathname: "/notebook/x", search: "?tab=quiz" });
    expect(ctx.route).toBe("/notebook/x?tab=quiz");
    expect(ctx.surface).toBe("web");
    expect(typeof ctx.appVersion).toBe("string");
  });

  it("reports surface=mobile inside the native shell", () => {
    (window as { __IS_NATIVE_SHELL__?: boolean }).__IS_NATIVE_SHELL__ = true;
    expect(captureFeedbackContext({ pathname: "/", search: "" }).surface).toBe("mobile");
  });
});

describe("validateFeedbackDraft", () => {
  it("rejects an empty / whitespace body", () => {
    expect(validateFeedbackDraft({ body: "   " })).toEqual({
      ok: false,
      error: "Enter a description first",
    });
  });
  it("rejects an over-long body", () => {
    expect(validateFeedbackDraft({ body: "x".repeat(5001) }).ok).toBe(false);
  });
  it("rejects an over-long detail", () => {
    expect(validateFeedbackDraft({ body: "it broke", detail: "x".repeat(5001) }).ok).toBe(false);
  });
  it("accepts a normal body", () => {
    expect(validateFeedbackDraft({ body: "it broke" })).toEqual({ ok: true });
  });
});
