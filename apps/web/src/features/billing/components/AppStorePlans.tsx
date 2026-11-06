import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Spinner } from "@/shared/components/ui/spinner";
import { useToast } from "@/shared/contexts/useToast";
import { yearlySavingsPercent } from "../appStore/appStorePricing";
import {
  type IapProduct,
  openIapSubscriptionManagement,
  purchaseIapProduct,
  restoreIapPurchases,
} from "../appStore/iapBridge";
import { useIapProducts } from "../appStore/useIapProducts";
import { PRO_PLAN_FEATURES } from "../planFeatures";
import type { SubscriptionStatusResponse } from "../types";
import { PlanCard } from "./PlanCard";

interface AppStorePlansProps {
  status: Pick<
    SubscriptionStatusResponse,
    "hasSubscription" | "source" | "appStoreProductId" | "isLoading"
  >;
}

const LEGAL_LINK_CLASS = "underline-offset-2 hover:text-foreground hover:underline";

/** Pro plans sold through Apple in-app purchase, inside an iOS build that supports it. */
export function AppStorePlans({ status }: AppStorePlansProps) {
  const { state, retry } = useIapProducts();
  const toast = useToast();
  // What is in flight ("restore", "manage" or a product id); one task at a time.
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const busy = busyKey !== null;

  // Until the plan resolves we can't tell a Stripe subscriber from a Free user, and offering
  // Apple purchase to a Stripe subscriber would bill them twice.
  if (status.isLoading) {
    return (
      <p role="status" className="mb-12 text-center text-sm text-muted-foreground">
        Loading plans…
      </p>
    );
  }

  if (status.source === "stripe") {
    return (
      <Card className="mx-auto mb-12 max-w-md">
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Your Pro plan is billed through the website.
          </p>
        </CardContent>
      </Card>
    );
  }

  const run = async (key: string, task: () => Promise<void>) => {
    setBusyKey(key);
    try {
      await task();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setBusyKey(null);
    }
  };

  const buy = (product: IapProduct) =>
    run(product.id, async () => {
      const outcome = await purchaseIapProduct(product.id);
      if (outcome.status === "purchased") toast.success("You're on Pro");
      else if (outcome.status === "pending") toast.info("Waiting for approval");
      else if (outcome.status === "error") toast.error(outcome.message);
    });

  const restore = () =>
    run("restore", async () => {
      const restored = await restoreIapPurchases();
      if (restored > 0) toast.success("Purchases restored");
      else toast.info("No purchases found for this Apple ID");
    });

  if (state.status === "loading") {
    return (
      <p role="status" className="mb-12 text-center text-sm text-muted-foreground">
        Loading plans…
      </p>
    );
  }
  if (state.status === "error") {
    return (
      <div className="mb-12 flex flex-col items-center gap-3 text-center">
        <p className="text-sm text-muted-foreground">{state.message}</p>
        <Button variant="outline" onClick={retry}>
          Try again
        </Button>
      </div>
    );
  }

  const yearly = state.products.find((p) => p.period === "year");
  const monthly = state.products.find((p) => p.period === "month");
  const savings = yearlySavingsPercent(monthly?.price ?? null, yearly?.price ?? null);
  const onAppStore = status.source === "app_store";

  const action = (product: IapProduct) => {
    if (onAppStore && status.appStoreProductId === product.id) {
      return (
        <Button variant="secondary" size="lg" disabled className="w-full">
          Current plan
        </Button>
      );
    }
    const active = busyKey === product.id;
    return (
      <Button
        size="lg"
        className="w-full"
        disabled={busy}
        aria-busy={active}
        onClick={() => void buy(product)}
      >
        {active && <Spinner aria-hidden />}
        {onAppStore ? `Switch to ${product.period === "year" ? "yearly" : "monthly"}` : "Subscribe"}
      </Button>
    );
  };

  return (
    <div className="mb-12 flex flex-col gap-8">
      <p className="mx-auto max-w-xl text-center text-xs text-muted-foreground">
        Payment is charged to your Apple ID at confirmation of purchase. Auto-renews until canceled.
        Cancel any time in Settings at least 24 hours before renewal.{" "}
        <Link to="/terms" className={LEGAL_LINK_CLASS}>
          Terms of Use
        </Link>{" "}
        ·{" "}
        <Link to="/privacy" className={LEGAL_LINK_CLASS}>
          Privacy Policy
        </Link>
      </p>
      <div className="mx-auto grid w-full max-w-3xl gap-8 md:grid-cols-2">
        {yearly && (
          <PlanCard
            title="Pro Yearly"
            subtitle="Billed once a year"
            price={yearly.displayPrice}
            periodLabel="/year"
            badge={savings ? `Save ${savings}%` : undefined}
            highlighted
            featuresLabel="Everything included:"
            features={PRO_PLAN_FEATURES}
            action={action(yearly)}
          />
        )}
        {monthly && (
          <PlanCard
            title="Pro Monthly"
            subtitle="Billed every month"
            price={monthly.displayPrice}
            proChecks
            featuresLabel="Everything included:"
            features={PRO_PLAN_FEATURES}
            action={action(monthly)}
          />
        )}
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <Button
          variant="outline"
          disabled={busy}
          aria-busy={busyKey === "restore"}
          onClick={() => void restore()}
        >
          {busyKey === "restore" && <Spinner aria-hidden />}
          Restore purchases
        </Button>
        {onAppStore && (
          <Button
            variant="outline"
            disabled={busy}
            aria-busy={busyKey === "manage"}
            onClick={() => void run("manage", openIapSubscriptionManagement)}
          >
            {busyKey === "manage" && <Spinner aria-hidden />}
            Manage subscription
          </Button>
        )}
      </div>
    </div>
  );
}
