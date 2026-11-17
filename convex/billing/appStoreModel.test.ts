import { describe, expect, test } from "vitest";
import {
  ENTITLEMENT_LEEWAY_MS,
  isAppStoreEntitled,
  isOlderThan,
  mergeStatus,
  statusFromNotification,
  statusFromTransaction,
} from "./appStoreModel";

const NOW = 1_800_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

describe("statusFromTransaction", () => {
  test("active while unexpired", () => {
    expect(statusFromTransaction({ expiresAt: NOW + DAY }, NOW)).toBe("active");
  });
  test("expired once past expiry", () => {
    expect(statusFromTransaction({ expiresAt: NOW - 1 }, NOW)).toBe("expired");
  });
  test("revoked wins over expiry", () => {
    expect(statusFromTransaction({ expiresAt: NOW + DAY, revokedAt: NOW - 1 }, NOW)).toBe(
      "revoked"
    );
  });
});

describe("statusFromNotification", () => {
  test.each([
    ["SUBSCRIBED", undefined, "active"],
    ["SUBSCRIBED", "RESUBSCRIBE", "active"],
    ["DID_RENEW", "BILLING_RECOVERY", "active"],
    ["DID_FAIL_TO_RENEW", "GRACE_PERIOD", "grace"],
    ["DID_FAIL_TO_RENEW", undefined, "billing_retry"],
    ["GRACE_PERIOD_EXPIRED", undefined, "billing_retry"],
    ["EXPIRED", "VOLUNTARY", "expired"],
    ["REFUND", undefined, "revoked"],
    ["REVOKE", undefined, "revoked"],
  ] as const)("%s/%s → %s", (type, subtype, expected) => {
    expect(statusFromNotification(type, subtype)).toBe(expected);
  });

  test.each(["DID_CHANGE_RENEWAL_STATUS", "DID_CHANGE_RENEWAL_PREF", "RENEWAL_EXTENDED", "TEST"])(
    "%s leaves the status alone",
    (type) => {
      expect(statusFromNotification(type, undefined)).toBeUndefined();
    }
  );
});

describe("mergeStatus", () => {
  test("keeps grace and billing retry when the transaction alone says expired", () => {
    expect(mergeStatus("grace", "expired")).toBe("grace");
    expect(mergeStatus("billing_retry", "expired")).toBe("billing_retry");
  });
  test("otherwise the transaction decides", () => {
    expect(mergeStatus("expired", "active")).toBe("active");
    expect(mergeStatus("grace", "revoked")).toBe("revoked");
    expect(mergeStatus(undefined, "expired")).toBe("expired");
  });
});

describe("isAppStoreEntitled", () => {
  test("active and unexpired is Pro", () => {
    expect(isAppStoreEntitled({ status: "active", expiresAt: NOW + DAY }, NOW)).toBe(true);
  });
  test("active within the leeway after expiry is still Pro", () => {
    expect(
      isAppStoreEntitled({ status: "active", expiresAt: NOW - ENTITLEMENT_LEEWAY_MS + 1 }, NOW)
    ).toBe(true);
  });
  test("active past the leeway is not Pro (missed EXPIRED notification)", () => {
    expect(
      isAppStoreEntitled({ status: "active", expiresAt: NOW - ENTITLEMENT_LEEWAY_MS - 1 }, NOW)
    ).toBe(false);
  });
  test("grace uses the grace deadline", () => {
    expect(
      isAppStoreEntitled(
        { status: "grace", expiresAt: NOW - 5 * DAY, gracePeriodExpiresAt: NOW + DAY },
        NOW
      )
    ).toBe(true);
  });
  test.each(["billing_retry", "expired", "revoked"] as const)("%s is not Pro", (status) => {
    expect(isAppStoreEntitled({ status, expiresAt: NOW + DAY }, NOW)).toBe(false);
  });
});

describe("isOlderThan", () => {
  test("is true only for a strictly earlier expiry", () => {
    expect(isOlderThan({ expiresAt: 100 }, { expiresAt: 99 })).toBe(true);
    expect(isOlderThan({ expiresAt: 100 }, { expiresAt: 100 })).toBe(false);
    expect(isOlderThan({ expiresAt: 100 }, { expiresAt: 101 })).toBe(false);
  });
});
