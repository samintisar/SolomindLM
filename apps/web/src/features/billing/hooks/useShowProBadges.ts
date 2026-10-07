import { useContext } from "react";
import { NotebookContext } from "@/features/notebooks/useNotebookContext";
import { canOfferPurchases } from "@/utils/platformDetection";

/**
 * True when Pro-only features should be marked "Pro": the viewer is on the
 * Free plan and the platform can sell Pro (the native app can't, so it gets
 * no upgrade prompts). Outside the notebook context, and while the
 * subscription is still loading (so Pro users never see a flash), it returns false.
 */
export function useShowProBadges(): boolean {
  const context = useContext(NotebookContext);
  if (!context || !canOfferPurchases()) return false;
  const { hasSubscription, isLoading } = context.subscriptionStatus;
  return !isLoading && !hasSubscription;
}
