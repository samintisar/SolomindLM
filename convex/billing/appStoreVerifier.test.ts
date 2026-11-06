import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  renewal: vi.fn(),
  notification: vi.fn(),
}));

vi.mock("@apple/app-store-server-library", () => {
  class VerificationException extends Error {
    status: number;
    constructor(status: number) {
      super(`status ${status}`);
      this.status = status;
    }
  }
  class SignedDataVerifier {
    environment: string;
    constructor(_certs: unknown, _online: boolean, environment: string) {
      this.environment = environment;
    }
    verifyAndDecodeTransaction(jws: string) {
      return mocks.transaction(this.environment, jws);
    }
    verifyAndDecodeRenewalInfo(jws: string) {
      return mocks.renewal(this.environment, jws);
    }
    verifyAndDecodeNotification(jws: string) {
      return mocks.notification(this.environment, jws);
    }
  }
  return {
    SignedDataVerifier,
    VerificationException,
    VerificationStatus: {
      OK: 0,
      VERIFICATION_FAILURE: 1,
      RETRYABLE_VERIFICATION_FAILURE: 2,
      INVALID_APP_IDENTIFIER: 3,
      INVALID_ENVIRONMENT: 4,
      INVALID_CHAIN_LENGTH: 5,
      INVALID_CERTIFICATE: 6,
      FAILURE: 7,
      0: "OK",
      1: "VERIFICATION_FAILURE",
      2: "RETRYABLE_VERIFICATION_FAILURE",
      3: "INVALID_APP_IDENTIFIER",
      4: "INVALID_ENVIRONMENT",
      5: "INVALID_CHAIN_LENGTH",
      6: "INVALID_CERTIFICATE",
      7: "FAILURE",
    },
    Environment: { SANDBOX: "Sandbox", PRODUCTION: "Production" },
    AutoRenewStatus: { OFF: 0, ON: 1 },
  };
});

import { VerificationException } from "@apple/app-store-server-library";
import { ExternalServiceError } from "../_lib/errors";
import {
  AppStoreVerificationError,
  verifyNotification,
  verifyTransaction,
} from "./appStoreVerifier";

function jws(payload: unknown): string {
  return `h.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.s`;
}

const goodTx = {
  originalTransactionId: "orig",
  transactionId: "tx1",
  productId: "pro.monthly",
  expiresDate: 5000,
};

beforeEach(() => {
  mocks.transaction.mockReset();
  mocks.renewal.mockReset();
  mocks.notification.mockReset();
});

describe("verifyTransaction", () => {
  it("uses the Production verifier for a Production claim", async () => {
    mocks.transaction.mockResolvedValue(goodTx);
    const result = await verifyTransaction(jws({ environment: "Production" }));
    expect(mocks.transaction).toHaveBeenCalledWith("Production", expect.any(String));
    expect(result.environment).toBe("Production");
  });

  it("uses the Sandbox verifier for a Sandbox claim and normalizes fields", async () => {
    mocks.transaction.mockResolvedValue({
      ...goodTx,
      revocationDate: 99,
      appAccountToken: "ABCD-EF",
    });
    const result = await verifyTransaction(jws({ environment: "Sandbox" }));
    expect(mocks.transaction).toHaveBeenCalledWith("Sandbox", expect.any(String));
    expect(result).toEqual({
      environment: "Sandbox",
      originalTransactionId: "orig",
      transactionId: "tx1",
      productId: "pro.monthly",
      expiresAt: 5000,
      revokedAt: 99,
      appAccountToken: "abcd-ef",
    });
  });

  it.each([
    ["unknown", { environment: "Xcode" }],
    ["missing", {}],
  ])("rejects a %s environment", async (_label, payload) => {
    await expect(verifyTransaction(jws(payload))).rejects.toBeInstanceOf(AppStoreVerificationError);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects an undecodable JWS", async () => {
    await expect(verifyTransaction("garbage")).rejects.toBeInstanceOf(AppStoreVerificationError);
    await expect(verifyTransaction("h.!!!.s")).rejects.toBeInstanceOf(AppStoreVerificationError);
  });

  it("treats a transient verification failure as an external service error", async () => {
    mocks.transaction.mockRejectedValue(new VerificationException(2));
    const error = await verifyTransaction(jws({ environment: "Production" })).catch((e) => e);
    expect(error).toBeInstanceOf(ExternalServiceError);
    expect(error.retryable).toBe(true);
    expect(error.cause).toBeInstanceOf(VerificationException);
  });

  it("treats other verification failures as untrustworthy data", async () => {
    mocks.transaction.mockRejectedValue(new VerificationException(5));
    const error = await verifyTransaction(jws({ environment: "Production" })).catch((e) => e);
    expect(error).toBeInstanceOf(AppStoreVerificationError);
    expect(error.message).toContain("INVALID_CHAIN_LENGTH");
  });

  it("throws when a verified transaction lacks subscription fields", async () => {
    mocks.transaction.mockResolvedValue({ transactionId: "tx1" });
    await expect(verifyTransaction(jws({ environment: "Production" }))).rejects.toBeInstanceOf(
      AppStoreVerificationError
    );
  });
});

describe("verifyNotification", () => {
  const base = {
    notificationUUID: "uuid-1",
    notificationType: "DID_RENEW",
    subtype: "BILLING_RECOVERY",
  };

  it("verifies a Sandbox notification with the Sandbox verifier throughout", async () => {
    mocks.notification.mockResolvedValue({
      ...base,
      data: { signedTransactionInfo: "t", signedRenewalInfo: "r" },
    });
    mocks.transaction.mockResolvedValue(goodTx);
    mocks.renewal.mockResolvedValue({
      autoRenewStatus: 1,
      autoRenewProductId: "pro.yearly",
      gracePeriodExpiresDate: 7000,
    });
    const result = await verifyNotification(jws({ data: { environment: "Sandbox" } }));
    expect(mocks.notification).toHaveBeenCalledWith("Sandbox", expect.any(String));
    expect(mocks.transaction).toHaveBeenCalledWith("Sandbox", "t");
    expect(mocks.renewal).toHaveBeenCalledWith("Sandbox", "r");
    expect(result).toEqual({
      notificationUUID: "uuid-1",
      notificationType: "DID_RENEW",
      subtype: "BILLING_RECOVERY",
      environment: "Sandbox",
      transaction: {
        environment: "Sandbox",
        originalTransactionId: "orig",
        transactionId: "tx1",
        productId: "pro.monthly",
        expiresAt: 5000,
      },
      renewal: { autoRenews: true, autoRenewProductId: "pro.yearly", gracePeriodExpiresAt: 7000 },
    });
  });

  it("falls back to summary and appData environment claims", async () => {
    mocks.notification.mockResolvedValue(base);
    await verifyNotification(jws({ summary: { environment: "Production" } }));
    expect(mocks.notification).toHaveBeenLastCalledWith("Production", expect.any(String));
    await verifyNotification(jws({ appData: { environment: "Sandbox" } }));
    expect(mocks.notification).toHaveBeenLastCalledWith("Sandbox", expect.any(String));
  });

  it("rejects a notification with no environment claim", async () => {
    await expect(verifyNotification(jws({ data: {} }))).rejects.toBeInstanceOf(
      AppStoreVerificationError
    );
  });

  it("reports autoRenews false when renewal info says off", async () => {
    mocks.notification.mockResolvedValue({ ...base, data: { signedRenewalInfo: "r" } });
    mocks.renewal.mockResolvedValue({ autoRenewStatus: 0 });
    const result = await verifyNotification(jws({ data: { environment: "Production" } }));
    expect(result.renewal).toEqual({ autoRenews: false });
    expect(result.transaction).toBeUndefined();
  });

  it("drops a verified nested transaction that lacks subscription fields", async () => {
    mocks.notification.mockResolvedValue({ ...base, data: { signedTransactionInfo: "t" } });
    mocks.transaction.mockResolvedValue({ transactionId: "tx1" });
    const result = await verifyNotification(jws({ data: { environment: "Production" } }));
    expect(result.transaction).toBeUndefined();
  });

  it("rejects a notification without id or type", async () => {
    mocks.notification.mockResolvedValue({});
    await expect(
      verifyNotification(jws({ data: { environment: "Production" } }))
    ).rejects.toBeInstanceOf(AppStoreVerificationError);
  });
});
