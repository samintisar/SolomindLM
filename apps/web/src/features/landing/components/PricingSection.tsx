import React from 'react';
import { Check, Zap, Crown } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';

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
  icon: React.ElementType;
}

const pricingPlans: PricingPlan[] = [
  {
    name: 'Free',
    price: '$0',
    description: 'Perfect for getting started',
    features: [
      '20 notebooks per account',
      '20 sources per notebook',
      '50 chat messages/day',
      '5 flashcards/day',
      '5 quizzes/day',
      '5 reports/day',
      '1 audio overview/day',
      '5 written questions/day'
    ],
    cta: 'Get Started Free',
    highlighted: false,
    icon: Zap
  },
  {
    name: 'Yearly',
    price: '$7.50',
    period: '/month ($90/year)',
    description: 'Best value – billed once per year',
    features: [
      '200 notebooks per account',
      '100 sources per notebook',
      '500 chat messages/day',
      '100 flashcards/day',
      '100 quizzes/day',
      '100 reports/day',
      '5 audio overviews/day',
      '100 written questions/day'
    ],
    cta: 'Get Started',
    highlighted: true,
    icon: Crown
  },
  {
    name: 'Monthly',
    price: '$15',
    period: '/month',
    description: 'Billed every month',
    features: [
      '200 notebooks per account',
      '100 sources per notebook',
      '500 chat messages/day',
      '100 flashcards/day',
      '100 quizzes/day',
      '100 reports/day',
      '5 audio overviews/day',
      '100 written questions/day'
    ],
    cta: 'Get Started',
    highlighted: false,
    icon: Crown
  }
];

export const PricingSection: React.FC<PricingSectionProps> = ({ onGetStarted }) => {
  return (
    <section id="pricing" className="py-32 px-6">
      <div className="max-w-[1500px] w-full mx-auto">
        {/* Section Header */}
        <div className="text-center mb-24">
          <h2 className="text-3xl md:text-4xl font-sans font-bold text-foreground mb-4">
            Simple, Transparent Pricing
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Start free, upgrade when you need more. No hidden fees, cancel anytime.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {pricingPlans.map((plan) => {
            const Icon = plan.icon;
            return (
              <div
                key={plan.name}
                className={`relative rounded-2xl p-8 transition-all duration-300 ${
                  plan.highlighted
                    ? 'bg-primary text-primary-foreground shadow-2xl scale-105 border-2 border-primary'
                    : 'bg-card border border-border shadow-sm hover:shadow-lg'
                }`}
              >
                {plan.highlighted && (
                  <div className="flex justify-center mb-4">
                    <span className="bg-accent text-accent-foreground text-sm font-semibold px-4 py-1 rounded-full">
                      Save 50%
                    </span>
                  </div>
                )}

                {/* Plan Header */}
                <div className="text-center mb-8">
                  <div className={`inline-flex p-3 rounded-xl mb-4 ${
                    plan.highlighted ? 'bg-primary-foreground/20' : 'bg-secondary'
                  }`}>
                    <Icon className={`w-8 h-8 ${plan.highlighted ? 'text-primary-foreground' : 'text-primary'}`} />
                  </div>
                  <h3 className={`text-xl font-bold mb-2 ${
                    plan.highlighted ? 'text-primary-foreground' : 'text-foreground'
                  }`}>
                    {plan.name}
                  </h3>
                  <div className="mb-2">
                    <span className={`text-4xl font-bold ${
                      plan.highlighted ? 'text-primary-foreground' : 'text-foreground'
                    }`}>
                      {plan.price}
                    </span>
                    {plan.period && (
                      <span className={`text-sm ${
                        plan.highlighted ? 'text-primary-foreground/80' : 'text-muted-foreground'
                      }`}>
                        {plan.period}
                      </span>
                    )}
                  </div>
                  <p className={`text-sm ${
                    plan.highlighted ? 'text-primary-foreground/80' : 'text-muted-foreground'
                  }`}>
                    {plan.description}
                  </p>
                </div>

                {/* Features List */}
                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <Check className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                        plan.highlighted ? 'text-primary-foreground' : 'text-primary'
                      }`} />
                      <span className={`text-sm ${plan.highlighted ? 'text-primary-foreground/90' : 'text-foreground'}`}>
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* CTA Button */}
                <Button
                  onClick={onGetStarted}
                  className={`w-full rounded-full font-semibold transition-transform duration-200 ease-out hover:scale-[1.02] active:scale-[0.98] ${
                    plan.highlighted
                      ? 'bg-white !text-gray-900 hover:bg-gray-100'
                      : 'bg-primary text-primary-foreground hover:bg-primary/90'
                  }`}
                  size="lg"
                >
                  {plan.cta}
                </Button>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
};
