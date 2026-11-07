/**
 * Custom hook for handling limit errors with upgrade CTAs.
 * Combines error parsing with toast notifications and Stripe checkout flow.
 */

import { useCallback, useLayoutEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useCreateCheckout } from "@/features/billing/services/subscriptionApi";
import { canOfferPurchases, purchaseChannel } from "@/utils/platformDetection";
import { useToast } from "../contexts/useToast";
import {
  getLimitErrorMessage,
  getUpgradeMessage,
  isUpgradeableLimit,
  type ParsedLimitError,
  parseLimitError,
} from "../utils/errorParser";

/**
 * Options for handleLimitError
 */
export interface HandleLimitErrorOptions {
  /** Custom error message to use instead of the parsed one */
  errorMessage?: string;
  /** Custom upgrade message to use instead of the default */
  upgradeMessage?: string;
  /** Whether to show the upgrade button (default: true) */
  showUpgradeButton?: boolean;
  /** Callback when upgrade button is clicked (default: Stripe checkout, or the Billing page in the iOS app) */
  onUpgrade?: () => void;
}

/**
 * Result object from handleLimitError
 */
export interface HandleLimitErrorResult {
  /** Whether the error was a limit error */
  isLimitError: boolean;
  /** The parsed limit error data (if applicable) */
  parsedError?: ParsedLimitError;
}

/**
 * Custom hook for handling limit errors with upgrade CTAs
 */
export function useLimitErrorToast() {
  const { error: showError } = useToast();
  const createCheckout = useCreateCheckout();
  // Under <BrowserRouter> navigate is rebuilt on every pathname change. Read it through a ref so
  // handleLimitError keeps a stable identity across navigations.
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  useLayoutEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

  /**
   * Handle an error and show appropriate toast with upgrade CTA if it's a limit error
   */
  const handleLimitError = useCallback(
    async (
      error: unknown,
      options: HandleLimitErrorOptions = {}
    ): Promise<HandleLimitErrorResult> => {
      const parsedError = parseLimitError(error);

      if (!parsedError) {
        // Not a limit error, return false
        return { isLimitError: false };
      }

      const { errorMessage, upgradeMessage, showUpgradeButton = true, onUpgrade } = options;

      // Get messages. The native app can't sell Pro, so it gets no upgrade copy at all.
      const purchasable = canOfferPurchases();
      const message = errorMessage || getLimitErrorMessage(parsedError);
      const upgradeText = purchasable ? upgradeMessage || getUpgradeMessage(parsedError) : "";

      // Default upgrade handler: Stripe checkout on the web. The iOS app sells through the App Store,
      // so it opens the Billing page, where the in-app purchase plans live.
      const defaultOnUpgrade = async () => {
        if (purchaseChannel() === "app_store") {
          navigateRef.current("/billing");
          return;
        }
        try {
          const successUrl = `${window.location.origin}/billing?success=true`;
          const cancelUrl = `${window.location.origin}/billing?canceled=true`;
          const { url } = await createCheckout("month", successUrl, cancelUrl);
          window.location.href = url;
        } catch (err) {
          console.error("Failed to open checkout:", err);
          showError("Failed to open checkout. Please try again.");
        }
      };

      // Build full message
      const fullMessage = upgradeText ? `${message} ${upgradeText}` : message;

      const effectiveShowUpgrade =
        purchasable && showUpgradeButton && !parsedError.isPro && isUpgradeableLimit(parsedError);

      // Show toast with upgrade button (free tier only)
      showError(fullMessage, {
        duration: 8000,
        action: effectiveShowUpgrade
          ? {
              label: "Upgrade to Pro",
              onClick: onUpgrade || defaultOnUpgrade,
            }
          : undefined,
      });

      return { isLimitError: true, parsedError };
    },
    [showError, createCheckout]
  );

  /**
   * Check if an error is a limit error without showing a toast
   */
  const isLimitError = useCallback((error: unknown): boolean => {
    return parseLimitError(error) !== null;
  }, []);

  /**
   * Parse an error to get limit information
   */
  const getLimitInfo = useCallback((error: unknown): ParsedLimitError | null => {
    return parseLimitError(error);
  }, []);

  return {
    handleLimitError,
    isLimitError,
    getLimitInfo,
  };
}
