import React from "react";
import { Check } from "lucide-react";
import {
  useSubscriptionStatus,
  useCreateCheckout,
  useCancelSubscription,
} from "../services/subscriptionApi";
import { useConfirmDialog } from "@/shared/ui/ConfirmDialog";

interface BillingPageProps {
  onBack: () => void;
}

const freeFeatures = [
  "20 notebooks per account",
  "20 sources per notebook",
  "50 chat messages/day",
  "5 flashcards/day",
  "5 quizzes/day",
  "5 reports/day",
  "1 audio overview/day",
  "5 written questions/day",
];

const proFeatures = [
  "200 notebooks per account",
  "100 sources per notebook",
  "500 chat messages/day",
  "100 flashcards/day",
  "100 quizzes/day",
  "100 reports/day",
  "5 audio overviews/day",
  "100 written questions/day",
];

export const BillingPage: React.FC<BillingPageProps> = ({ onBack }) => {
  const status = useSubscriptionStatus();
  const { confirm, ConfirmDialogComponent } = useConfirmDialog();
  const createCheckout = useCreateCheckout();
  const cancelSubscription = useCancelSubscription();

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
            <h1 className="text-5xl font-serif font-bold mb-4 text-foreground">Choose Your Plan</h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              {status?.hasSubscription
                ? "Manage your subscription and billing information below"
                : "Unlock unlimited access to all SolomindLM features"}
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 px-4">
          <div className="max-w-6xl mx-auto">
            {/* Current Plan Section */}
            {status?.hasSubscription && (
              <div className="mb-12">
                <div className="bg-card border-2 border-border rounded-xl p-8">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-2xl font-serif font-bold mb-1 text-foreground">
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
                        <p className="text-sm text-orange-500 font-medium mt-2">
                          ⚠️ Cancels at the end of your billing period
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-muted-foreground mb-2">Current Price</div>
                      <p className="text-3xl font-serif font-bold mb-3">
                        ${status.amount ? (status.amount / 100).toFixed(0) : 0}
                        <span className="text-lg font-normal text-muted-foreground">
                          /{status.interval}
                        </span>
                      </p>
                      <div className="text-sm">
                        <p className="text-success-foreground font-medium capitalize">
                          ✓ {status.status}
                        </p>
                      </div>
                    </div>
                  </div>
                  {!status.cancelAtPeriodEnd && (
                    <button
                      onClick={handleCancel}
                      className="mt-6 px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted/50 disabled:opacity-50 transition-colors"
                    >
                      Cancel Subscription
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Pricing Cards Grid */}
            <div
              className={`grid gap-8 mb-12 ${status?.hasSubscription ? "lg:grid-cols-3" : "lg:grid-cols-3"}`}
            >
              {/* Free Plan */}
              <div className="bg-card border-2 border-border rounded-xl p-8 flex flex-col hover:shadow-lg transition-all duration-300">
                <div className="mb-6">
                  <h3 className="text-2xl font-serif font-bold mb-2 text-foreground">Free</h3>
                  <p className="text-sm text-muted-foreground">
                    {status?.hasSubscription ? "Your previous plan" : "Get started today"}
                  </p>
                </div>

                <div className="mb-6">
                  <p className="text-5xl font-serif font-bold text-foreground">
                    $0
                    <span className="text-lg font-normal text-muted-foreground">/month</span>
                  </p>
                </div>

                {status?.hasSubscription ? (
                  <button
                    onClick={onBack}
                    className="w-full mb-8 py-3 border-2 border-border text-foreground font-medium rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    Downgrade
                  </button>
                ) : (
                  <div className="w-full mb-8 py-3 bg-muted text-muted-foreground font-medium rounded-lg text-center">
                    Current Plan
                  </div>
                )}

                <div className="space-y-3 flex-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">
                    Included:
                  </p>
                  {freeFeatures.map((feature) => (
                    <div key={feature} className="flex items-start gap-3">
                      <Check className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
                      <span className="text-sm text-foreground">{feature}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Yearly */}
              <div className="relative">
                {/* Save Badge */}
                <div className="absolute left-1/2 -translate-x-1/2 -top-4 z-10">
                  <div className="bg-primary text-primary-foreground px-4 py-1 rounded-xl text-sm font-semibold whitespace-nowrap">
                    Save 50%
                  </div>
                </div>

                <div className="bg-card border-2 border-primary rounded-xl p-8 flex flex-col shadow-lg hover:shadow-xl transition-all duration-300">
                  <div className="mb-6">
                    <h3 className="text-2xl font-serif font-bold mb-2 text-foreground">Yearly</h3>
                    <p className="text-sm text-muted-foreground">
                      Best value – billed once per year
                    </p>
                  </div>

                  <div className="mb-6">
                    <div className="flex items-baseline gap-2">
                      <p className="text-5xl font-serif font-bold text-foreground">
                        $7.50
                        <span className="text-lg font-normal text-muted-foreground">/month</span>
                      </p>
                      <p className="text-sm text-muted-foreground font-normal">($90/year)</p>
                    </div>
                  </div>

                  {status?.hasSubscription ? (
                    <button
                      disabled={true}
                      className="w-full mb-8 py-3 bg-muted text-muted-foreground font-medium rounded-lg cursor-default opacity-50"
                    >
                      Current Plan
                    </button>
                  ) : (
                    <button
                      onClick={() => handleUpgrade("year")}
                      className="w-full mb-8 py-3 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 transition-colors"
                    >
                      Get Started
                    </button>
                  )}

                  <div className="space-y-3 flex-1">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">
                      Everything included:
                    </p>
                    {proFeatures.map((feature) => (
                      <div key={feature} className="flex items-start gap-3">
                        <Check className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                        <span className="text-sm text-foreground">{feature}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Monthly */}
              <div className="bg-card border-2 border-border rounded-xl p-8 flex flex-col hover:shadow-lg hover:border-primary/50 transition-all duration-300">
                <div className="mb-6">
                  <h3 className="text-2xl font-serif font-bold mb-2 text-foreground">Monthly</h3>
                  <p className="text-sm text-muted-foreground">Billed every month</p>
                </div>

                <div className="mb-6">
                  <p className="text-5xl font-serif font-bold text-foreground">
                    $15
                    <span className="text-lg font-normal text-muted-foreground">/month</span>
                  </p>
                </div>

                {status?.hasSubscription ? (
                  <button
                    disabled={true}
                    className="w-full mb-8 py-3 bg-muted text-muted-foreground font-medium rounded-lg cursor-default opacity-50"
                  >
                    Current Plan
                  </button>
                ) : (
                  <button
                    onClick={() => handleUpgrade("month")}
                    className="w-full mb-8 py-3 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 transition-colors"
                  >
                    Get Started
                  </button>
                )}

                <div className="space-y-3 flex-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">
                    Everything included:
                  </p>
                  {proFeatures.map((feature) => (
                    <div key={feature} className="flex items-start gap-3">
                      <Check className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                      <span className="text-sm text-foreground">{feature}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <ConfirmDialogComponent />
    </>
  );
};
