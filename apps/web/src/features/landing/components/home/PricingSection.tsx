import { Check } from "lucide-react";
import { useState } from "react";
import { PRO_YEARLY_SAVINGS_PERCENT } from "@/features/billing/planPricing";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import {
  BILLING_LABELS,
  type Billing,
  PLANS,
  type Plan,
  PRICING_HEADLINE,
} from "./landingHomeContent";
import { Reveal } from "./Reveal";
import { Accent, SectionHeading } from "./SectionHeading";

const BILLING_PERIODS = Object.keys(BILLING_LABELS) as Billing[];

function PlanCard({
  plan,
  billing,
  onGetStarted,
}: {
  plan: Plan;
  billing: Billing;
  onGetStarted: () => void;
}) {
  return (
    <Card variant={plan.featured ? "featured" : "flush"}>
      <div className="flex h-full flex-col p-7 md:p-8">
        <div className="flex items-center justify-between">
          <h3 className="font-sans text-xs font-semibold tracking-widest text-muted-foreground uppercase">
            {plan.name}
          </h3>
          {plan.featured && billing === "annual" ? <Badge>Best value</Badge> : null}
        </div>
        <p className="mt-5 flex flex-wrap items-baseline gap-x-2">
          <span className="font-display text-5xl font-bold tracking-tight">
            {plan.price[billing]}
          </span>
          <span className="font-sans text-sm text-muted-foreground">{plan.period[billing]}</span>
        </p>
        <p className="mt-2 font-serif text-base text-muted-foreground">{plan.description}</p>
        <ul className="mt-6 mb-8 grid gap-3 border-t border-border/50 pt-6 font-sans text-sm">
          {plan.features.map((feature) => (
            <li key={feature} className="flex items-center gap-2.5">
              <Check aria-hidden className="size-4 shrink-0 text-primary" />
              {feature}
            </li>
          ))}
        </ul>
        <Button
          size="lg"
          variant={plan.featured ? "default" : "outline"}
          className="mt-auto w-full"
          onClick={onGetStarted}
        >
          {plan.cta}
        </Button>
      </div>
    </Card>
  );
}

export function PricingSection({
  onGetStarted,
  note,
}: {
  onGetStarted: () => void;
  /** A small line under the cards (the /pricing page's currency note). */
  note?: string;
}) {
  const [billing, setBilling] = useState<Billing>("annual");
  return (
    <section
      id="pricing"
      aria-labelledby="pricing-title"
      className="scroll-mt-20 px-6 py-24 md:py-28"
    >
      <div className="mx-auto max-w-280">
        <SectionHeading
          id="pricing-title"
          eyebrow="Pricing"
          title={
            <>
              {PRICING_HEADLINE.lead} <Accent>{PRICING_HEADLINE.accent}</Accent>
            </>
          }
        />
        {/* The billing switch is a real tablist: each period's plans are its panel. */}
        <Reveal>
          <Tabs
            value={billing}
            onValueChange={(value) => setBilling(value as Billing)}
            className="mt-8 items-center"
          >
            <div className="flex items-center justify-center gap-3">
              <TabsList aria-label="Billing period">
                {BILLING_PERIODS.map((period) => (
                  <TabsTrigger key={period} value={period}>
                    {BILLING_LABELS[period]}
                  </TabsTrigger>
                ))}
              </TabsList>
              <Badge variant="success">Save {PRO_YEARLY_SAVINGS_PERCENT}%</Badge>
            </div>
            {BILLING_PERIODS.map((period) => (
              <TabsContent key={period} value={period} className="mt-8 w-full">
                <div className="mx-auto grid max-w-215 grid-cols-1 gap-6 md:grid-cols-2">
                  {PLANS.map((plan) => (
                    <PlanCard
                      key={plan.id}
                      plan={plan}
                      billing={period}
                      onGetStarted={onGetStarted}
                    />
                  ))}
                </div>
              </TabsContent>
            ))}
          </Tabs>
          {note ? (
            <p className="mt-6 text-center font-sans text-xs text-muted-foreground">{note}</p>
          ) : null}
        </Reveal>
      </div>
    </section>
  );
}
