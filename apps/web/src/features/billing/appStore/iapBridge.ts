import { getNativeWebViewBridge, shellSupportsIap } from "@/utils/platformDetection";

/** Native dispatches this event (detail = response) to answer a `shell-web:iap` request. */
export const IAP_RESPONSE_EVENT = "solomindlm-shell-iap-response";

export interface IapProduct {
  id: string;
  /** Apple's localized price, e.g. "$1.99" or "1,99 €". */
  displayPrice: string;
  /** Numeric price in the store currency, when StoreKit reports it. */
  price: number | null;
  period: "month" | "year";
}

export type IapPurchaseOutcome =
  | { status: "purchased" | "cancelled" | "pending" }
  | { status: "error"; message: string };

type IapAction = "products" | "purchase" | "restore" | "manage";

type IapResponse =
  | { requestId: string; ok: true; result: unknown }
  | { requestId: string; ok: false; error: string };

const DEFAULT_TIMEOUT_MS = 15_000;
/** Apple's sheet can stay up while the user signs in or confirms; Pro still shows via getPlan. */
const PURCHASE_TIMEOUT_MS = 5 * 60_000;
const RESTORE_TIMEOUT_MS = 5 * 60_000;

function isIapResponse(value: unknown): value is IapResponse {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.requestId === "string" &&
    (r.ok === true || (r.ok === false && typeof r.error === "string"))
  );
}

function hasRequestId(value: unknown, requestId: string): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<string, unknown>).requestId === requestId
  );
}

function isIapProduct(value: unknown): value is IapProduct {
  if (typeof value !== "object" || value === null) return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.id === "string" &&
    typeof p.displayPrice === "string" &&
    (p.price === null || typeof p.price === "number") &&
    (p.period === "month" || p.period === "year")
  );
}

function createRequestId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `iap_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function request(
  action: IapAction,
  extra: Record<string, string>,
  timeoutMs: number
): Promise<unknown> {
  const bridge = getNativeWebViewBridge();
  if (!shellSupportsIap() || !bridge) {
    return Promise.reject(new Error("In-app purchase isn't available in this version of the app."));
  }
  const requestId = createRequestId();
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("The App Store didn't respond. Try again."));
    }, timeoutMs);
    const onResponse = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (!hasRequestId(detail, requestId)) return;
      // Any reply carrying our id ends the request; a malformed one must not leave it hanging.
      cleanup();
      if (!isIapResponse(detail)) reject(new Error("The App Store sent an unexpected response."));
      else if (detail.ok) resolve(detail.result);
      else reject(new Error(detail.error));
    };
    const cleanup = () => {
      window.clearTimeout(timer);
      window.removeEventListener(IAP_RESPONSE_EVENT, onResponse);
    };
    window.addEventListener(IAP_RESPONSE_EVENT, onResponse);
    try {
      bridge.postMessage(JSON.stringify({ type: "shell-web:iap", requestId, action, ...extra }));
    } catch {
      cleanup();
      reject(new Error("Couldn't reach the app. Try again."));
    }
  });
}

export async function loadIapProducts(): Promise<IapProduct[]> {
  const result = (await request("products", {}, DEFAULT_TIMEOUT_MS)) as { products?: unknown };
  return Array.isArray(result?.products) ? result.products.filter(isIapProduct) : [];
}

export async function purchaseIapProduct(productId: string): Promise<IapPurchaseOutcome> {
  const result = (await request("purchase", { productId }, PURCHASE_TIMEOUT_MS)) as {
    status?: unknown;
    message?: unknown;
  };
  if (
    result?.status === "purchased" ||
    result?.status === "cancelled" ||
    result?.status === "pending"
  ) {
    return { status: result.status };
  }
  return {
    status: "error",
    message:
      typeof result?.message === "string" ? result.message : "The purchase didn't go through.",
  };
}

export async function restoreIapPurchases(): Promise<number> {
  const result = (await request("restore", {}, RESTORE_TIMEOUT_MS)) as { restored?: unknown };
  return typeof result?.restored === "number" ? result.restored : 0;
}

export async function openIapSubscriptionManagement(): Promise<void> {
  await request("manage", {}, DEFAULT_TIMEOUT_MS);
}
