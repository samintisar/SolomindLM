import { api } from "@convex/_generated/api";
import { APP_STORE_PRODUCT_IDS, isAppStoreProductId } from "@convex/billing/appStoreProducts";
import { convexClient } from "@mobile/services/convex/client";
import {
  deepLinkToSubscriptions,
  ErrorCode,
  fetchProducts,
  finishTransaction,
  getAvailablePurchases,
  initConnection,
  type Purchase,
  purchaseUpdatedListener,
  requestPurchase,
  restorePurchases as restoreStorePurchases,
} from "expo-iap";
import {
  type BridgeProduct,
  errorMessage,
  type PurchaseErrorCodes,
  type PurchaseOutcome,
  purchaseOutcomeFromError,
  toBridgeProducts,
} from "./iapMappers";

/** Matches the web page's purchase timeout: the Apple sheet can stay up while the user signs in. */
const PURCHASE_TIMEOUT_MS = 5 * 60 * 1000;

const ERROR_CODES: PurchaseErrorCodes = {
  cancelled: ErrorCode.UserCancelled,
  pending: [ErrorCode.DeferredPayment, ErrorCode.Pending],
};

let connection: Promise<unknown> | null = null;
function ensureConnection(): Promise<unknown> {
  connection ??= initConnection().catch((error: unknown) => {
    connection = null;
    throw error;
  });
  return connection;
}

interface PendingPurchase {
  productId: string;
  resolve: (outcome: PurchaseOutcome) => void;
  timer: ReturnType<typeof setTimeout> | null;
}

/** The one purchase the web page is waiting on. Claimed before any await so taps can't overlap. */
let pending: PendingPurchase | null = null;

/** Answer the page, once, if `slot` is still the current purchase. */
function settle(slot: PendingPurchase, outcome: PurchaseOutcome) {
  if (pending !== slot) return;
  pending = null;
  if (slot.timer) clearTimeout(slot.timer);
  slot.resolve(outcome);
}

/** Transactions already being synced, so the listener and `requestPurchase` don't both send one. */
const inflight = new Map<string, Promise<boolean>>();

async function sendAndFinish(purchase: Purchase): Promise<boolean> {
  if (!purchase.purchaseToken || !isAppStoreProductId(purchase.productId)) return false;
  await convexClient.action(api.billing.appStoreNode.syncTransaction, {
    signedTransaction: purchase.purchaseToken,
  });
  await finishTransaction({ purchase, isConsumable: false });
  return true;
}

/**
 * Send the signed transaction to Convex, then finish it. Finishing only after Convex accepts it
 * means a crash in between leaves the transaction unfinished, and StoreKit redelivers it.
 */
function syncAndFinish(purchase: Purchase): Promise<boolean> {
  const existing = inflight.get(purchase.id);
  if (existing) return existing;
  const run = sendAndFinish(purchase).finally(() => inflight.delete(purchase.id));
  inflight.set(purchase.id, run);
  return run;
}

async function completePurchase(slot: PendingPurchase, purchase: Purchase) {
  try {
    const synced = await syncAndFinish(purchase);
    settle(
      slot,
      synced
        ? { status: "purchased" }
        : { status: "error", message: "The purchase couldn't be completed. Try restoring it." }
    );
  } catch (error) {
    settle(slot, { status: "error", message: errorMessage(error) });
  }
}

/** Start once at app launch. Handles new purchases and ones StoreKit redelivers. */
export function startIapListeners(): () => void {
  void ensureConnection().catch(() => {
    /* retried on the next request */
  });
  const updated = purchaseUpdatedListener((purchase) => {
    const slot = pending;
    if (slot && slot.productId === purchase.productId) {
      if (purchase.purchaseState === "pending") {
        settle(slot, { status: "pending" });
        return;
      }
      void completePurchase(slot, purchase);
      return;
    }
    // Nobody is waiting: a renewal, a redelivery, or an Ask to Buy approved later. Sync quietly;
    // a failure leaves the transaction unfinished, so StoreKit redelivers it.
    if (purchase.purchaseState === "pending") return;
    void syncAndFinish(purchase).catch(() => {
      /* retried when StoreKit redelivers */
    });
  });
  return () => updated.remove();
}

export async function loadProducts(): Promise<BridgeProduct[]> {
  await ensureConnection();
  const products = await fetchProducts({ skus: [...APP_STORE_PRODUCT_IDS], type: "subs" });
  return toBridgeProducts(
    (products ?? []).map(({ id, displayPrice, price }) => ({ id, displayPrice, price }))
  );
}

export function purchase(productId: string): Promise<PurchaseOutcome> {
  if (!isAppStoreProductId(productId)) {
    return Promise.resolve({ status: "error", message: "Unknown plan." });
  }
  if (pending) {
    return Promise.resolve({ status: "error", message: "A purchase is already in progress." });
  }
  const slot: PendingPurchase = { productId, resolve: () => undefined, timer: null };
  const outcome = new Promise<PurchaseOutcome>((resolve) => {
    slot.resolve = resolve;
  });
  pending = slot;
  slot.timer = setTimeout(
    () =>
      settle(slot, {
        status: "error",
        message: "The App Store didn't respond. Try again.",
      }),
    PURCHASE_TIMEOUT_MS
  );

  void (async () => {
    try {
      await ensureConnection();
      const appAccountToken = await convexClient.mutation(api.billing.appStore.getAccountToken, {});
      const result = await requestPurchase({
        request: { apple: { sku: productId, appAccountToken } },
        type: "subs",
      });
      // iOS resolves with the purchase; don't depend on the listener alone.
      const bought = Array.isArray(result) ? result[0] : result;
      if (bought?.purchaseToken && bought.purchaseState !== "pending") {
        await completePurchase(slot, bought);
      } else if (bought?.purchaseState === "pending") {
        settle(slot, { status: "pending" });
      }
      // Otherwise the listener (or the timeout) answers.
    } catch (error) {
      settle(slot, purchaseOutcomeFromError(error, ERROR_CODES));
    }
  })();
  return outcome;
}

/** Try every current purchase for this Apple ID; throws only if all of them failed. */
async function syncAvailablePurchases(): Promise<number> {
  await ensureConnection();
  const purchases = await getAvailablePurchases();
  let restored = 0;
  let failures = 0;
  let firstError: unknown;
  for (const item of purchases) {
    try {
      if (await syncAndFinish(item)) restored += 1;
    } catch (error) {
      failures += 1;
      firstError ??= error;
    }
  }
  if (failures > 0 && restored === 0) throw firstError;
  return restored;
}

/** The user's "Restore purchases": have StoreKit sync with the App Store first, then send what it has. */
export async function restorePurchases(): Promise<number> {
  await ensureConnection();
  let storeSyncError: unknown;
  let storeSyncFailed = false;
  try {
    await restoreStorePurchases();
  } catch (error) {
    storeSyncFailed = true;
    storeSyncError = error;
  }
  // Still send whatever StoreKit already has, even if the App Store sync failed.
  const restored = await syncAvailablePurchases();
  if (storeSyncFailed && restored === 0) throw storeSyncError;
  return restored;
}

/** Quiet re-sync on launch / sign-in (no App Store prompt); failures are retried next time. */
export async function syncCurrentPurchases(): Promise<void> {
  try {
    await syncAvailablePurchases();
  } catch {
    /* not signed in yet, offline, or linked to another account: nothing to show here */
  }
}

export async function openSubscriptionManagement(): Promise<void> {
  await deepLinkToSubscriptions({});
}
