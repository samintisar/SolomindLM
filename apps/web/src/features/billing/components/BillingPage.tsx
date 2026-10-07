import { Check } from "lucide-react";
import React from "react";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { useConfirmDialog } from "@/shared/ui/useConfirmDialog";
import { canOfferPurchases } from "@/utils/platformDetection";
import { FREE_PLAN_FEATURES, PRO_PLAN_FEATURES } from "../planFeatures";
import {
  useCancelSubscription,
  useCreateCheckout,
  useCreatePortalSession,
  useSubscriptionStatus,
} from "../services/subscriptionApi";
import { PlanCard } from "./PlanCard";

interface BillingPageProps {
  onBack: () => void;
}

export const BillingPage: React.FC<BillingPageProps> = ({ onBack }) => {
  const status = useSubscriptionStatus();
  const { confirm, ConfirmDialogComponent } = useConfirmDialog();
  const createCheckout = useCreateCheckout();
  const createPortalSession = useCreatePortalSession();
  const cancelSubscription = useCancelSubscription();
  const purchasable = canOfferPurchases();

  const handleUpgrade = async (interval: "month" | "year") => {
    try {
      // Use root URL with query params - App.tsx handles the redirect
      const successUrl = `${window.location.origin}?success=true`;
      const cancelUrl = `${window.location.origin}?canceled=true`;

      const session = await createCheckout(interval, successUrl, cancelUrl);
      window.location.href = session.url;
    } catch (error) {
      console.error("Failed to create checkout:", error);
      alert(error instanceof Error ? error.message : "Failed to start checkout");
    }
  };

  // Existing subscribers switch billing interval through the Stripe customer
  // portal rather than a fresh Checkout Session, which would create a second,
  // concurrent subscription instead of changing the current one.
  const handleManagePlan = async () => {
    try {
      const { url } = await createPortalSession(window.location.origin);
      window.location.href = url;
    } catch (error) {
      console.error("Failed to open billing portal:", error);
      alert(error instanceof Error ? error.message : "Failed to open billing portal");
    }
  };

  const handleCancel = async () => {
    const confirmed = await confirm(
      "Cancel Subscription",
      "Are you sure you want to cancel your subscription? You will lose access to Pro features at the end of your billing period.",
      { confirmText: "Cancel Subscription", cancelText: "Keep Subscription", variant: "danger" }
    );
    if (!confirmed) return;

    try {
      await cancelSubscription();
    } catch (error) {
      console.error("Failed to cancel subscription:", error);
      alert(error instanceof Error ? error.message : "Failed to cancel subscription");
    }
  };

  return (
    <>
      <div className="min-h-screen bg-background flex flex-col">
        {/* Hero Section */}
        <div className="pt-16 pb-12 px-4">
          <div className="max-w-3xl mx-auto text-center">
            <button
              onClick={onBack}
              className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <span>←</span> Back
            </button>
            <h1 className="text-5xl font-serif font-bold mb-4 text-foreground">
              {purchasable ? "Choose Your Plan" : "Your Plan"}
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              {status?.hasSubscription
                ? "Manage your subscription and billing information below"
                : purchasable
                  ? "Unlock unlimited access to all SolomindLM features"
                  : "Here's what your plan includes"}
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 px-4">
          <div className="max-w-6xl mx-auto">
            {/* Current Plan Section */}
            {status?.hasSubscription && (
              <Card className="mb-12">
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-2xl font-display font-bold mb-1 text-foreground">
                        Pro Plan
                      </h2>
                      <p className="text-muted-foreground mb-1">
                        {status.interval === "month" ? "Monthly" : "Yearly"} billing
                      </p>
                      {status.currentPeriodEnd && (
                        <p className="text-sm text-muted-foreground">
                          {status.cancelAtPeriodEnd ? "Access until " : "Renews on "}
                          {new Date(status.currentPeriodEnd).toLocaleDateString(undefined, {
                            dateStyle: "long",
                          })}
                        </p>
                      )}
                      {status.cancelAtPeriodEnd && (
                        <p className="text-sm text-warning-muted-foreground font-medium mt-2">
                          ⚠️ Cancels at the end of your billing period
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      {purchasable && (
                        <>
                          <div className="text-sm text-muted-foreground mb-2">Current Price</div>
                          <p className="text-3xl font-display font-bold mb-3">
                            ${status.amount ? (status.amount / 100).toFixed(0) : 0}
                            <span className="text-lg font-normal text-muted-foreground">
                              /{status.interval}
                            </span>
                          </p>
                        </>
                      )}
                      <div className="text-sm">
                        <p className="inline-block rounded-md bg-success/10 px-2 py-0.5 font-medium capitalize text-success">
                          ✓ {status.status}
                        </p>
                      </div>
                    </div>
                  </div>
                  {!status.cancelAtPeriodEnd && (
                    <Button variant="outline" onClick={handleCancel} className="mt-6">
                      Cancel Subscription
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Native app: plan summary only — no prices or checkout (see canOfferPurchases) */}
            {!purchasable && !status?.hasSubscription && (
              <Card className="mx-auto mb-12 max-w-md">
                <CardContent>
                  <h2 className="text-2xl font-display font-bold mb-1 text-foreground">
                    Free Plan
                  </h2>
                  <p className="text-sm text-muted-foreground mb-6">Your current plan</p>
                  <ul className="flex flex-col gap-3">
                    {FREE_PLAN_FEATURES.map((feature) => (
                      <li key={feature} className="flex items-start gap-3">
                        <Check
                          aria-hidden
                          className="mt-0.5 size-5 shrink-0 text-muted-foreground"
                        />
                        <span className="text-sm text-foreground">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* Pricing Cards Grid */}
            {purchasable && (
              <div className="mb-12 grid gap-8 lg:grid-cols-3">
                <PlanCard
                  title="Free"
                  subtitle={status?.hasSubscription ? "Your previous plan" : "Get started today"}
                  price="$0"
                  featuresLabel="Included:"
                  features={FREE_PLAN_FEATURES}
                  action={
                    status?.hasSubscription ? (
                      <Button variant="outline" size="lg" onClick={onBack} className="w-full">
                        Downgrade
                      </Button>
                    ) : (
                      <Button variant="secondary" size="lg" disabled className="w-full">
                        Current Plan
                      </Button>
                    )
                  }
                />
                <PlanCard
                  title="Yearly"
                  subtitle="Best value – billed once per year"
                  price="$7.50"
                  priceNote="($90/year)"
                  badge="Save 50%"
                  highlighted
                  featuresLabel="Everything included:"
                  features={PRO_PLAN_FEATURES}
                  action={
                    status?.hasSubscription && status.interval === "year" ? (
                      <Button variant="secondary" size="lg" disabled className="w-full">
                        Current Plan
                      </Button>
                    ) : (
                      <Button
                        size="lg"
                        onClick={() =>
                          status?.hasSubscription ? handleManagePlan() : handleUpgrade("year")
                        }
                        className="w-full"
                      >
                        {status?.hasSubscription ? "Switch to Yearly" : "Get Started"}
                      </Button>
                    )
                  }
                />
                <PlanCard
                  title="Monthly"
                  subtitle="Billed every month"
                  price="$15"
                  proChecks
                  featuresLabel="Everything included:"
                  features={PRO_PLAN_FEATURES}
                  action={
                    status?.hasSubscription && status.interval === "month" ? (
                      <Button variant="secondary" size="lg" disabled className="w-full">
                        Current Plan
                      </Button>
                    ) : (
                      <Button
                        size="lg"
                        onClick={() =>
                          status?.hasSubscription ? handleManagePlan() : handleUpgrade("month")
                        }
                        className="w-full"
                      >
                        {status?.hasSubscription ? "Switch to Monthly" : "Get Started"}
                      </Button>
                    )
                  }
                />
              </div>
            )}
          </div>
        </div>
      </div>
      <ConfirmDialogComponent />
    </>
  );
};
