import { cva, type VariantProps } from "class-variance-authority";
import { Progress as ProgressPrimitive } from "radix-ui";
import type * as React from "react";
import { cn } from "@/shared/utils/cn";

const progressIndicatorVariants = cva(
  "h-full w-full flex-1 translate-x-(--progress-offset) rounded-full transition-all",
  {
    variants: {
      tone: { default: "bg-primary", destructive: "bg-destructive" },
    },
    defaultVariants: { tone: "default" },
  }
);

function Progress({
  className,
  value,
  tone,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> &
  VariantProps<typeof progressIndicatorVariants>) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-muted", className)}
      value={value}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={progressIndicatorVariants({ tone })}
        style={{ "--progress-offset": `${(value ?? 0) - 100}%` } as React.CSSProperties}
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress };
