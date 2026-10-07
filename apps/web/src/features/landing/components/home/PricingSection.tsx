import { Check } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { type Billing, PLANS, type Plan } from "./landingHomeContent";
import { Reveal } from "./Reveal";
import { Accent, SectionHeading } from "./SectionHeading";

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

export function PricingSection({ onGetStarted }: { onGetStarted: () => void }) {
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
              Start free. <Accent>Upgrade when it's worth it.</Accent>
            </>
          }
        />
        <Reveal className="mt-8 flex items-center justify-center gap-3">
          <Tabs value={billing} onValueChange={(value) => setBilling(value as Billing)}>
            <TabsList aria-label="Billing period">
              <TabsTrigger value="annual">Annual</TabsTrigger>
              <TabsTrigger value="monthly">Monthly</TabsTrigger>
            </TabsList>
          </Tabs>
          <Badge variant="success">Save 50%</Badge>
        </Reveal>
        <Reveal className="mx-auto mt-10 grid max-w-215 gap-6 md:grid-cols-2">
          {PLANS.map((plan) => (
            <PlanCard key={plan.id} plan={plan} billing={billing} onGetStarted={onGetStarted} />
          ))}
        </Reveal>
      </div>
    </section>
  );
}
