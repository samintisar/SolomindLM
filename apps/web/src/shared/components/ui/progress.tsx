import { cva, type VariantProps } from "class-variance-authority";
import { Progress as ProgressPrimitive } from "radix-ui";
import type * as React from "react";
import { cn } from "@/shared/utils/cn";

const progressVariants = cva("relative w-full overflow-hidden rounded-full bg-muted", {
  variants: {
    size: { default: "h-2", sm: "h-1" },
  },
  defaultVariants: { size: "default" },
});

// With no value (null) Radix marks the bar indeterminate: a short segment sweeps across instead.
const progressIndicatorVariants = cva(
  "h-full w-full flex-1 translate-x-(--progress-offset) rounded-full transition-all data-[state=indeterminate]:w-2/5 data-[state=indeterminate]:translate-x-0 data-[state=indeterminate]:animate-progress-sweep",
  {
    variants: {
      tone: { default: "bg-primary", destructive: "bg-destructive" },
      // A highlight gliding along the filled part, for work in progress. Off under reduced motion.
      glint: {
        true: "relative overflow-hidden after:absolute after:inset-y-0 after:right-0 after:left-(--progress-fill-start) data-[state=indeterminate]:after:left-0 after:bg-linear-to-r after:from-transparent after:via-primary-foreground/45 after:to-transparent after:animate-progress-glint motion-reduce:after:hidden",
        false: "",
      },
    },
    defaultVariants: { tone: "default", glint: false },
  }
);

function Progress({
  className,
  value,
  tone,
  glint,
  size,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> &
  VariantProps<typeof progressIndicatorVariants> &
  VariantProps<typeof progressVariants>) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      data-size={size ?? "default"}
      className={cn(progressVariants({ size }), className)}
      value={value}
      {...props}
    >
      <ProgressPrimitive.Indicator
        // Remount when the mode flips so leaving the sweep does not animate from mid-track.
        key={value == null ? "indeterminate" : "determinate"}
        data-slot="progress-indicator"
        className={progressIndicatorVariants({ tone, glint })}
        style={
          {
            "--progress-offset": `${(value ?? 0) - 100}%`,
            "--progress-fill-start": `${100 - (value ?? 0)}%`,
          } as React.CSSProperties
        }
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress };
