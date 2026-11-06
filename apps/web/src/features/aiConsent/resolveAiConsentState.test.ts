import { describe, expect, test } from "vitest";
import {
  type AiConsentRecord,
  type ResolveAiConsentInput,
  resolveAiConsentState,
} from "./resolveAiConsentState";

const answered = (version: number | null, declined = false): AiConsentRecord => ({
  signedIn: true,
  version,
  declined,
});

function input(overrides: Partial<ResolveAiConsentInput> = {}): ResolveAiConsentInput {
  return {
    inShell: true,
    authLoading: false,
    isAuthenticated: true,
    record: answered(null),
    previous: null,
    currentVersion: 2,
    ...overrides,
  };
}

describe("resolveAiConsentState", () => {
  test("is not applicable on the web", () => {
    expect(resolveAiConsentState(input({ inShell: false }))).toBe("notApplicable");
  });

  test("asks when the user has never answered", () => {
    expect(resolveAiConsentState(input())).toBe("needsConsent");
  });

  test("asks again when the stored version is older", () => {
    expect(resolveAiConsentState(input({ record: answered(1) }))).toBe("needsConsent");
  });

  test("grants on the current version", () => {
    expect(resolveAiConsentState(input({ record: answered(2) }))).toBe("granted");
  });

  test("shows declined after Not now", () => {
    expect(resolveAiConsentState(input({ record: answered(null, true) }))).toBe("declined");
  });

  test("loads while auth is loading on a cold start", () => {
    expect(resolveAiConsentState(input({ authLoading: true, record: undefined }))).toBe("loading");
  });

  test("loads while the query is pending", () => {
    expect(resolveAiConsentState(input({ record: undefined }))).toBe("loading");
  });

  test("leaves signed-out users to the app's own sign-in flow", () => {
    expect(resolveAiConsentState(input({ isAuthenticated: false, record: undefined }))).toBe(
      "notApplicable"
    );
  });

  test.each([
    ["granted", answered(null, true), "declined"],
    ["granted", answered(1), "needsConsent"],
    ["declined", answered(2), "granted"],
    ["needsConsent", answered(null, true), "declined"],
  ] as const)("a fresh answer replaces a held %s", (previous, record, expected) => {
    expect(resolveAiConsentState(input({ previous, record }))).toBe(expected);
  });

  test.each([
    ["auth loading", { authLoading: true, record: undefined }],
    ["query reads signed out", { record: { signedIn: false } as AiConsentRecord }],
    ["query pending", { record: undefined }],
  ])("holds the previous answer through a blip (%s)", (_label, blip) => {
    for (const previous of ["granted", "needsConsent", "declined"] as const) {
      expect(resolveAiConsentState(input({ ...blip, previous }))).toBe(previous);
    }
  });

  test("keeps a held consent or off screen up while auth reads signed out", () => {
    for (const previous of ["needsConsent", "declined"] as const) {
      expect(
        resolveAiConsentState(input({ isAuthenticated: false, record: undefined, previous }))
      ).toBe(previous);
    }
  });

  test("drops a held grant when auth reads signed out, so the shell hides native upload", () => {
    expect(
      resolveAiConsentState(
        input({ isAuthenticated: false, record: undefined, previous: "granted" })
      )
    ).toBe("notApplicable");
  });
});
