/**
 * App Store identifiers for Pro. Plain TypeScript (no Convex imports) so the web Billing page and
 * the iOS shell import the same copy through `@convex/billing/appStoreProducts`.
 */
export const APP_STORE_PRODUCTS = {
  monthly: "com.solomindlm.app.pro.monthly",
  yearly: "com.solomindlm.app.pro.yearly",
} as const;

export type AppStoreProductId = (typeof APP_STORE_PRODUCTS)[keyof typeof APP_STORE_PRODUCTS];

export const APP_STORE_PRODUCT_IDS: readonly AppStoreProductId[] = [
  APP_STORE_PRODUCTS.monthly,
  APP_STORE_PRODUCTS.yearly,
];

export function isAppStoreProductId(id: string): id is AppStoreProductId {
  return (APP_STORE_PRODUCT_IDS as readonly string[]).includes(id);
}

export function appStoreProductPeriod(id: AppStoreProductId): "month" | "year" {
  return id === APP_STORE_PRODUCTS.yearly ? "year" : "month";
}

/** Must match `ios.bundleIdentifier` in apps/mobile/app.json. */
export const APP_STORE_BUNDLE_ID = "com.solomindlm.app";

/** The app's Apple ID in App Store Connect; Apple's verifier requires it for Production. */
export const APP_STORE_APP_APPLE_ID = 6812221524;
