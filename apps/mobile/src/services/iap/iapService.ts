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
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
} from "expo-iap";
import {
  type BridgeProduct,
  errorMessage,
  type PurchaseOutcome,
  purchaseOutcomeFromError,
  toBridgeProducts,
} from "./iapMappers";

let connection: Promise<unknown> | null = null;
function ensureConnection(): Promise<unknown> {
  connection ??= initConnection().catch((error: unknown) => {
    connection = null;
    throw error;
  });
  return connection;
}

/** The purchase the web page is waiting on; StoreKit answers through the listeners. */
let pending: { productId: string; resolve: (outcome: PurchaseOutcome) => void } | null = null;

function settle(outcome: PurchaseOutcome) {
  const waiting = pending;
  pending = null;
  waiting?.resolve(outcome);
}

/**
 * Send the signed transaction to Convex, then finish it. Finishing only after Convex accepts it
 * means a crash in between leaves the transaction unfinished, and StoreKit redelivers it.
 */
async function syncAndFinish(purchase: Purchase): Promise<boolean> {
  if (!purchase.purchaseToken || !isAppStoreProductId(purchase.productId)) return false;
  await convexClient.action(api.billing.appStoreNode.syncTransaction, {
    signedTransaction: purchase.purchaseToken,
  });
  await finishTransaction({ purchase, isConsumable: false });
  return true;
}

/** Start once at app launch. Handles new purchases and ones StoreKit redelivers. */
export function startIapListeners(): () => void {
  void ensureConnection().catch(() => {});
  const updated = purchaseUpdatedListener((purchase) => {
    void (async () => {
      const isPendingOne = pending?.productId === purchase.productId;
      // Ask to Buy: the purchase waits for approval; StoreKit delivers it again once approved.
      if (purchase.purchaseState === "pending") {
        if (isPendingOne) settle({ status: "pending" });
        return;
      }
      try {
        await syncAndFinish(purchase);
        if (isPendingOne) settle({ status: "purchased" });
      } catch (error) {
        if (isPendingOne) settle({ status: "error", message: errorMessage(error) });
      }
    })();
  });
  const failed = purchaseErrorListener((error) => {
    if (pending) settle(purchaseOutcomeFromError(error, ErrorCode.UserCancelled));
  });
  return () => {
    updated.remove();
    failed.remove();
  };
}

export async function loadProducts(): Promise<BridgeProduct[]> {
  await ensureConnection();
  const products = await fetchProducts({ skus: [...APP_STORE_PRODUCT_IDS], type: "subs" });
  return toBridgeProducts(
    (products ?? []).map(({ id, displayPrice, price }) => ({ id, displayPrice, price }))
  );
}

export async function purchase(productId: string): Promise<PurchaseOutcome> {
  if (!isAppStoreProductId(productId)) return { status: "error", message: "Unknown plan." };
  if (pending) return { status: "error", message: "A purchase is already in progress." };
  await ensureConnection();
  const appAccountToken = await convexClient.mutation(api.billing.appStore.getAccountToken, {});
  return new Promise<PurchaseOutcome>((resolve) => {
    pending = { productId, resolve };
    requestPurchase({
      request: { apple: { sku: productId, appAccountToken } },
      type: "subs",
    }).catch((error: unknown) => {
      if (pending?.resolve === resolve) {
        settle(purchaseOutcomeFromError(error, ErrorCode.UserCancelled));
      }
    });
  });
}

/** Sync every current purchase for this Apple ID; returns how many were Pro subscriptions. */
export async function restorePurchases(): Promise<number> {
  await ensureConnection();
  const purchases = await getAvailablePurchases();
  let restored = 0;
  for (const item of purchases) {
    if (await syncAndFinish(item)) restored += 1;
  }
  return restored;
}

/** Quiet re-sync on launch / sign-in; failures are retried next time. */
export async function syncCurrentPurchases(): Promise<void> {
  try {
    await restorePurchases();
  } catch {
    /* not signed in yet, offline, or linked to another account: nothing to show here */
  }
}

export async function openSubscriptionManagement(): Promise<void> {
  await deepLinkToSubscriptions({});
}
