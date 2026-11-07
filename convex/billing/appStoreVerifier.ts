"use node";

import {
  AutoRenewStatus,
  Environment,
  type JWSRenewalInfoDecodedPayload,
  type JWSTransactionDecodedPayload,
  SignedDataVerifier,
  VerificationException,
  VerificationStatus,
} from "@apple/app-store-server-library";
import { ExternalServiceError } from "../_lib/errors";
import { APPLE_ROOT_CA_G3_BASE64 } from "./appleRootCertificates";
import type { VerifiedNotification, VerifiedRenewal, VerifiedTransaction } from "./appStoreModel";
import { APP_STORE_APP_APPLE_ID, APP_STORE_BUNDLE_ID } from "./appStoreProducts";

/** Apple's signature or payload checks failed: the data is not trustworthy. */
export class AppStoreVerificationError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AppStoreVerificationError";
  }
}

type StoreEnvironment = VerifiedTransaction["environment"];

const verifiers = new Map<StoreEnvironment, SignedDataVerifier>();

function verifierFor(environment: StoreEnvironment): SignedDataVerifier {
  let verifier = verifiers.get(environment);
  if (!verifier) {
    verifier = new SignedDataVerifier(
      [Buffer.from(APPLE_ROOT_CA_G3_BASE64, "base64")],
      true,
      environment === "Production" ? Environment.PRODUCTION : Environment.SANDBOX,
      APP_STORE_BUNDLE_ID,
      APP_STORE_APP_APPLE_ID
    );
    verifiers.set(environment, verifier);
  }
  return verifier;
}

/**
 * Library failures become either a transient `ExternalServiceError` (OCSP / network; the
 * caller may retry) or an `AppStoreVerificationError` (the data is not trustworthy).
 */
async function mapVerification<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (!(error instanceof VerificationException)) throw error;
    const name = VerificationStatus[error.status] ?? String(error.status);
    if (error.status === VerificationStatus.RETRYABLE_VERIFICATION_FAILURE) {
      const failure = new ExternalServiceError(
        "app_store",
        `App Store verification could not complete (${name})`,
        { retryable: true }
      );
      failure.cause = error;
      throw failure;
    }
    throw new AppStoreVerificationError(`App Store signature rejected (${name})`, {
      cause: error,
    });
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

function decodeJwsPayload(jws: string): Record<string, unknown> {
  const segment = jws.split(".")[1];
  if (segment) {
    try {
      const parsed = asRecord(JSON.parse(Buffer.from(segment, "base64url").toString("utf8")));
      if (parsed) return parsed;
    } catch {
      // fall through to the rejection below
    }
  }
  throw new AppStoreVerificationError("Malformed signed data");
}

/**
 * Read the environment the payload claims, to choose which verifier checks it. The claim is
 * unverified, but the library re-checks the environment after verifying the signature, so a
 * forged claim only makes verification fail.
 */
function claimedEnvironment(jws: string): StoreEnvironment {
  const payload = decodeJwsPayload(jws);
  const claim =
    payload.environment ??
    asRecord(payload.data)?.environment ??
    asRecord(payload.summary)?.environment ??
    asRecord(payload.appData)?.environment;
  if (claim === "Production" || claim === "Sandbox") return claim;
  throw new AppStoreVerificationError("Signed data names no known App Store environment");
}

/** Our shape of a subscription transaction; undefined when a required field is missing. */
function toTransaction(
  environment: StoreEnvironment,
  tx: JWSTransactionDecodedPayload
): VerifiedTransaction | undefined {
  if (!(tx.originalTransactionId && tx.transactionId && tx.productId) || tx.expiresDate == null) {
    return undefined;
  }
  return {
    environment,
    originalTransactionId: tx.originalTransactionId,
    transactionId: tx.transactionId,
    productId: tx.productId,
    expiresAt: tx.expiresDate,
    ...(tx.revocationDate != null ? { revokedAt: tx.revocationDate } : {}),
    ...(tx.appAccountToken ? { appAccountToken: tx.appAccountToken.toLowerCase() } : {}),
  };
}

function toRenewal(info: JWSRenewalInfoDecodedPayload): VerifiedRenewal {
  return {
    autoRenews: info.autoRenewStatus === AutoRenewStatus.ON,
    ...(info.autoRenewProductId ? { autoRenewProductId: info.autoRenewProductId } : {}),
    ...(info.gracePeriodExpiresDate != null
      ? { gracePeriodExpiresAt: info.gracePeriodExpiresDate }
      : {}),
  };
}

/** Verify a transaction JWS the app received from StoreKit. */
export async function verifyTransaction(signedTransaction: string): Promise<VerifiedTransaction> {
  const environment = claimedEnvironment(signedTransaction);
  const decoded = await mapVerification(
    verifierFor(environment).verifyAndDecodeTransaction(signedTransaction)
  );
  const transaction = toTransaction(environment, decoded);
  if (!transaction) {
    throw new AppStoreVerificationError("Transaction is missing required subscription fields");
  }
  return transaction;
}

/** Verify an App Store Server Notification V2 `signedPayload` and its nested signed data. */
export async function verifyNotification(signedPayload: string): Promise<VerifiedNotification> {
  const environment = claimedEnvironment(signedPayload);
  const verifier = verifierFor(environment);
  const payload = await mapVerification(verifier.verifyAndDecodeNotification(signedPayload));
  if (!(payload.notificationUUID && payload.notificationType)) {
    throw new AppStoreVerificationError("Notification is missing its id or type");
  }
  const signedTransaction = payload.data?.signedTransactionInfo;
  const signedRenewal = payload.data?.signedRenewalInfo;
  let transaction: VerifiedTransaction | undefined;
  if (signedTransaction) {
    const decoded = await mapVerification(verifier.verifyAndDecodeTransaction(signedTransaction));
    // Verified but not a subscription transaction: the handler reports it as ignored.
    transaction = toTransaction(environment, decoded);
  }
  const renewal = signedRenewal
    ? toRenewal(await mapVerification(verifier.verifyAndDecodeRenewalInfo(signedRenewal)))
    : undefined;
  return {
    notificationUUID: payload.notificationUUID,
    notificationType: String(payload.notificationType),
    ...(payload.subtype ? { subtype: String(payload.subtype) } : {}),
    ...(typeof payload.signedDate === "number" ? { signedAt: payload.signedDate } : {}),
    environment,
    ...(transaction ? { transaction } : {}),
    ...(renewal ? { renewal } : {}),
  };
}
