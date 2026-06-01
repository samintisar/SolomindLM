import { BadgePercent, Check } from "lucide-react";
import React, { useState } from "react";
import { Button } from "@/shared/components/ui/button";

interface PricingSectionProps {
  onGetStarted: () => void;
}

interface PricingPlan {
  name: string;
  price: string;
  period?: string;
  description: string;
  features: string[];
  cta: string;
  highlighted: boolean;
  billingKey: "free" | "yearly" | "monthly";
}

const pricingPlans: PricingPlan[] = [
  {
    name: "Free",
    price: "$0",
    description: "Get started with core tools",
    features: [
      "20 notebooks · 200 sources each",
      "50 chat messages / day",
      "5 flashcards, quizzes, reports / day",
      "5 audio overviews / day",
      "5 infographics / day",
      "5 written questions / day",
    ],
    cta: "Start free",
    highlighted: false,
    billingKey: "free",
  },
  {
    name: "Pro",
    price: "$7.50",
    period: "/mo, billed yearly",
    description: "For serious learners",
    features: [
      "200 notebooks · 200 sources each",
      "500 chat messages / day",
      "100 flashcards, quizzes, reports / day",
      "100 audio overviews / day",
      "100 infographics / day",
      "100 written questions / day",
    ],
    cta: "Get Pro",
    highlighted: true,
    billingKey: "yearly",
  },
  {
    name: "Pro",
    price: "$15",
    period: "/mo",
    description: "Same as yearly, billed monthly",
    features: [
      "200 notebooks · 200 sources each",
      "500 chat messages / day",
      "100 flashcards, quizzes, reports / day",
      "100 audio overviews / day",
      "100 infographics / day",
      "100 written questions / day",
    ],
    cta: "Get Pro",
    highlighted: false,
    billingKey: "monthly",
  },
];

export const PricingSection: React.FC<PricingSectionProps> = ({ onGetStarted }) => {
  const [billing, setBilling] = useState<"yearly" | "monthly">("yearly");

  const plansToShow =
    billing === "yearly"
      ? pricingPlans.filter((p) => p.billingKey === "free" || p.billingKey === "yearly")
      : pricingPlans.filter((p) => p.billingKey === "free" || p.billingKey === "monthly");

  return (
    <section id="pricing" className="py-32 md:py-40 px-6 relative">
      {/* Subtle ambient glow behind cards */}
      <div
        className="absolute inset-0 pointer-events-none max-w-4xl mx-auto top-1/2 -translate-y-1/2 h-[420px] opacity-[0.07]"
        style={{
          background:
            "radial-gradient(ellipse 80% 100% at 50% 50%, var(--primary), transparent 70%)",
        }}
      />

      <div className="max-w-[1500px] w-full mx-auto relative">
        {/* Section Header */}
        <div className="text-center mb-16">
          <p className="text-sm font-medium text-primary uppercase tracking-widest mb-3">Pricing</p>
          <h2 className="text-3xl md:text-4xl font-display font-bold text-foreground tracking-tight mb-3">
            Start free. Upgrade when you need more.
          </h2>
        </div>

        {/* Billing toggle – only for the two Pro options */}
        <div className="flex justify-center mb-10">
          <div
            role="tablist"
            className="inline-flex p-1 rounded-xl bg-muted/80 border border-border/80"
            aria-label="Billing period"
          >
            <button
              type="button"
              role="tab"
              aria-selected={billing === "yearly"}
              onClick={() => setBilling("yearly")}
              className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                billing === "yearly"
                  ? "bg-background text-foreground shadow-sm border border-border"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Annual
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={billing === "monthly"}
              onClick={() => setBilling("monthly")}
              className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                billing === "monthly"
                  ? "bg-background text-foreground shadow-sm border border-border"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Monthly
            </button>
          </div>
          {billing === "yearly" && (
            <span className="ml-3 inline-flex items-center gap-1 text-sm text-primary font-medium">
              <BadgePercent className="w-4 h-4" aria-hidden />
              Save 50%
            </span>
          )}
        </div>

        {/* Pricing Cards – 2 columns: Free | Pro */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {plansToShow.map((plan) => (
            <div
              key={`${plan.billingKey}-${plan.name}`}
              className={`relative rounded-2xl transition-all duration-300 ${
                plan.highlighted
                  ? "bg-card border-2 border-primary/30 shadow-lg shadow-primary/5 dark:shadow-primary/10"
                  : "bg-card/80 border border-border hover:border-border/90 backdrop-blur-sm"
              }`}
            >
              {plan.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="inline-block px-3 py-1 rounded-xl bg-primary text-primary-foreground text-xs font-semibold">
                    Best value
                  </span>
                </div>
              )}

              <div className="p-8 md:p-9">
                {/* Plan name + price */}
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                    {plan.name}
                  </h3>
                  <div className="flex items-baseline gap-1.5 flex-wrap">
                    <span className="text-4xl md:text-5xl font-bold text-foreground tracking-tight tabular-nums">
                      {plan.price}
                    </span>
                    {plan.period && (
                      <span className="text-muted-foreground text-sm">{plan.period}</span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">{plan.description}</p>
                </div>

                {/* Features */}
                <ul className="space-y-2.5 mb-8">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" aria-hidden />
                      <span className="text-sm text-foreground/90">{feature}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <Button
                  onClick={onGetStarted}
                  variant={plan.highlighted ? "default" : "outline"}
                  className={`w-full rounded-xl font-semibold h-11 ${
                    plan.highlighted
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "border-border hover:bg-muted/50"
                  }`}
                  size="lg"
                >
                  {plan.cta}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
