/**
 * Error toasts: plan-limit errors get an "Upgrade to Pro" action (Stripe checkout) where the
 * platform can sell Pro; any other Convex / structured app error gets its parsed message.
 */

import { useCallback } from "react";
import { useCreateCheckout } from "@/features/billing/services/subscriptionApi";
import { canOfferPurchases } from "@/utils/platformDetection";
import { useToast } from "../contexts/useToast";
import {
  getLimitErrorMessage,
  getServiceErrorMessage,
  getUpgradeMessage,
  isUpgradeableLimit,
  type ParsedLimitError,
  type ParsedServiceError,
  parseAppError,
  parseLimitError,
} from "../utils/errorParser";

export interface HandleLimitErrorOptions {
  /** Custom error message to use instead of the parsed one */
  errorMessage?: string;
  /** Custom upgrade message to use instead of the default */
  upgradeMessage?: string;
}

export interface HandleLimitErrorResult {
  /** Whether the error was a limit error (and a toast was shown) */
  isLimitError: boolean;
  /** The parsed limit error data (if applicable) */
  parsedError?: ParsedLimitError;
}

export function useErrorToast() {
  const { error: toastError } = useToast();
  const createCheckout = useCreateCheckout();

  /** Toast a limit error with an upgrade CTA. Non-limit errors are left to the caller. */
  const handleLimitError = useCallback(
    async (
      error: unknown,
      options: HandleLimitErrorOptions = {}
    ): Promise<HandleLimitErrorResult> => {
      const parsedError = parseLimitError(error);
      if (!parsedError) return { isLimitError: false };

      // The native app can't sell Pro, so it gets no upgrade copy at all.
      const purchasable = canOfferPurchases();
      const message = options.errorMessage || getLimitErrorMessage(parsedError);
      const upgradeText = purchasable
        ? options.upgradeMessage || getUpgradeMessage(parsedError)
        : "";

      const openCheckout = async () => {
        try {
          const successUrl = `${window.location.origin}/billing?success=true`;
          const cancelUrl = `${window.location.origin}/billing?canceled=true`;
          const { url } = await createCheckout("month", successUrl, cancelUrl);
          window.location.href = url;
        } catch (err) {
          console.error("Failed to open checkout:", err);
          toastError("Failed to open checkout. Please try again.");
        }
      };

      const offerUpgrade = purchasable && !parsedError.isPro && isUpgradeableLimit(parsedError);
      toastError(upgradeText ? `${message} ${upgradeText}` : message, {
        duration: 8000,
        action: offerUpgrade ? { label: "Upgrade to Pro", onClick: openCheckout } : undefined,
      });

      return { isLimitError: true, parsedError };
    },
    [toastError, createCheckout]
  );

  /** Toast any error: the parsed app/limit message, else the Error's message. */
  const showError = useCallback(
    (err: unknown) => {
      const parsed = parseAppError(err);
      if (!parsed) {
        toastError(err instanceof Error ? err.message : "Something went wrong");
        return;
      }
      if ("isLimitError" in parsed && (parsed as ParsedLimitError).isLimitError) {
        toastError(getLimitErrorMessage(parsed as ParsedLimitError));
        return;
      }
      toastError(getServiceErrorMessage(parsed as ParsedServiceError));
    },
    [toastError]
  );

  return { handleLimitError, showError };
}
