import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/shared/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/shared/components/ui/card";
import { cn } from "@/shared/utils/cn";

interface PlanCardProps {
  title: string;
  subtitle: string;
  /** The amount, e.g. "$7.50"; rendered before a muted "/month". */
  price: string;
  priceNote?: string;
  action: ReactNode;
  featuresLabel: string;
  features: readonly string[];
  /** Lifts the card and tints the checks: the plan we recommend. */
  highlighted?: boolean;
  /** Tints the checks without lifting the card. */
  proChecks?: boolean;
  badge?: string;
}

export function PlanCard({
  title,
  subtitle,
  price,
  priceNote,
  action,
  featuresLabel,
  features,
  highlighted = false,
  proChecks = highlighted,
  badge,
}: PlanCardProps) {
  return (
    <div className="relative h-full">
      {badge && (
        <div className="absolute -top-3 left-1/2 z-10 -translate-x-1/2">
          <Badge>{badge}</Badge>
        </div>
      )}
      <Card variant={highlighted ? "elevated" : "default"} className="h-full">
        <CardHeader>
          <h3 className="font-display text-2xl font-bold text-foreground">{title}</h3>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col">
          <div className="flex flex-1 flex-col gap-6">
            <div className="flex items-baseline gap-2">
              <p className="font-display text-5xl font-bold text-foreground">
                {price}
                <span className="text-lg font-normal text-muted-foreground">/month</span>
              </p>
              {priceNote && <p className="text-sm text-muted-foreground">{priceNote}</p>}
            </div>
            {action}
            <div className="flex flex-1 flex-col gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {featuresLabel}
              </p>
              <ul className="flex flex-col gap-3">
                {features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <Check
                      aria-hidden
                      className={cn(
                        "mt-0.5 size-5 shrink-0",
                        proChecks ? "text-primary" : "text-muted-foreground"
                      )}
                    />
                    <span className="text-sm text-foreground">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
