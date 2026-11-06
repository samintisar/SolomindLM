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

function rejected(error: VerificationException): AppStoreVerificationError {
  return new AppStoreVerificationError(`App Store signature rejected (status ${error.status})`, {
    cause: error,
  });
}

/** Production first, then Sandbox: App Review and TestFlight buy in Sandbox against production. */
async function inEitherEnvironment<T>(
  verify: (verifier: SignedDataVerifier) => Promise<T>
): Promise<{ environment: StoreEnvironment; value: T }> {
  try {
    return { environment: "Production", value: await verify(verifierFor("Production")) };
  } catch (error) {
    if (!(error instanceof VerificationException)) throw error;
    if (error.status !== VerificationStatus.INVALID_ENVIRONMENT) throw rejected(error);
  }
  try {
    return { environment: "Sandbox", value: await verify(verifierFor("Sandbox")) };
  } catch (error) {
    if (error instanceof VerificationException) throw rejected(error);
    throw error;
  }
}

function toTransaction(
  environment: StoreEnvironment,
  tx: JWSTransactionDecodedPayload
): VerifiedTransaction {
  if (!tx.originalTransactionId || !tx.transactionId || !tx.productId || tx.expiresDate == null) {
    throw new AppStoreVerificationError("Transaction is missing required subscription fields");
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

async function decodeWith<T>(
  verifier: SignedDataVerifier,
  run: (v: SignedDataVerifier) => Promise<T>
) {
  try {
    return await run(verifier);
  } catch (error) {
    if (error instanceof VerificationException) throw rejected(error);
    throw error;
  }
}

/** Verify a transaction JWS the app received from StoreKit. */
export async function verifyTransaction(signedTransaction: string): Promise<VerifiedTransaction> {
  const { environment, value } = await inEitherEnvironment((verifier) =>
    verifier.verifyAndDecodeTransaction(signedTransaction)
  );
  return toTransaction(environment, value);
}

/** Verify an App Store Server Notification V2 `signedPayload` and its nested signed data. */
export async function verifyNotification(signedPayload: string): Promise<VerifiedNotification> {
  const { environment, value: payload } = await inEitherEnvironment((verifier) =>
    verifier.verifyAndDecodeNotification(signedPayload)
  );
  if (!payload.notificationUUID || !payload.notificationType) {
    throw new AppStoreVerificationError("Notification is missing its id or type");
  }
  const verifier = verifierFor(environment);
  const signedTransaction = payload.data?.signedTransactionInfo;
  const signedRenewal = payload.data?.signedRenewalInfo;
  const transaction = signedTransaction
    ? toTransaction(
        environment,
        await decodeWith(verifier, (v) => v.verifyAndDecodeTransaction(signedTransaction))
      )
    : undefined;
  const renewal = signedRenewal
    ? toRenewal(await decodeWith(verifier, (v) => v.verifyAndDecodeRenewalInfo(signedRenewal)))
    : undefined;
  return {
    notificationUUID: payload.notificationUUID,
    notificationType: String(payload.notificationType),
    ...(payload.subtype ? { subtype: String(payload.subtype) } : {}),
    environment,
    ...(transaction ? { transaction } : {}),
    ...(renewal ? { renewal } : {}),
  };
}
