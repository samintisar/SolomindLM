import { appStoreProductPeriod, isAppStoreProductId } from "@convex/billing/appStoreProducts";
import { ConvexError } from "convex/values";

export interface BridgeProduct {
  id: string;
  displayPrice: string;
  price: number | null;
  period: "month" | "year";
}

export type PurchaseOutcome =
  | { status: "purchased" | "cancelled" | "pending" }
  | { status: "error"; message: string };

/** StoreKit products → what the web Billing page shows; yearly first. */
export function toBridgeProducts(
  products: ReadonlyArray<{ id: string; displayPrice: string; price?: number | null }>
): BridgeProduct[] {
  return products
    .flatMap((p): BridgeProduct[] =>
      isAppStoreProductId(p.id)
        ? [
            {
              id: p.id,
              displayPrice: p.displayPrice,
              price: typeof p.price === "number" ? p.price : null,
              period: appStoreProductPeriod(p.id),
            },
          ]
        : []
    )
    .sort((a, b) => (a.period === b.period ? 0 : a.period === "year" ? -1 : 1));
}

/**
 * A readable message for any thrown value. A `ConvexError`'s own `.message` is a wrapper string, so
 * prefer the app-level text in its `data` (`detail` for service/validation errors, `message` for
 * limit errors); the rate limiter's data has no text, only `kind: "RateLimited"`.
 */
export function errorMessage(error: unknown): string {
  if (error instanceof ConvexError) {
    const data: unknown = error.data;
    if (typeof data === "object" && data !== null) {
      const fields = data as { kind?: unknown; detail?: unknown; message?: unknown };
      if (fields.kind === "RateLimited") return "Too many attempts. Try again later.";
      if (typeof fields.detail === "string" && fields.detail) return fields.detail;
      if (typeof fields.message === "string" && fields.message) return fields.message;
    }
  }
  return error instanceof Error ? error.message : String(error);
}

/** A purchase error → the outcome the page shows; `cancelCode` is expo-iap's UserCancelled code. */
export function purchaseOutcomeFromError(error: unknown, cancelCode: string): PurchaseOutcome {
  if (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === cancelCode
  ) {
    return { status: "cancelled" };
  }
  return { status: "error", message: errorMessage(error) };
}
