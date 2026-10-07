import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/shared/utils/cn";

/**
 * Surface for the landing page's decorative product pictures (not a design-system component: real
 * UI uses Card). `flat` sits in flow; `floating` is a callout lifted off the page.
 */
const demoSurface = cva("rounded-2xl bg-card ring-1 ring-hairline", {
  variants: {
    elevation: {
      flat: "shadow-xs",
      floating: "shadow-xl",
    },
  },
  defaultVariants: { elevation: "flat" },
});

export function DemoSurface({
  className,
  elevation,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof demoSurface>) {
  return <div className={cn(demoSurface({ elevation }), className)} {...props} />;
}

/** Small caps label inside a demo card ("FLASHCARD", "YOUR ANSWER"). */
export function DemoLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-sans text-xs font-semibold tracking-wider text-muted-foreground uppercase">
      {children}
    </p>
  );
}
