import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/shared/utils/cn";

const cardVariants = cva(
  "flex flex-col gap-6 rounded-2xl bg-card py-6 text-card-foreground ring-1 ring-hairline",
  {
    variants: {
      variant: {
        default: "shadow-xs",
        elevated: "bg-card/90 shadow-lg shadow-primary/5 backdrop-blur-sm",
        // Edge-to-edge content (lists, disclosures): no padding or gap, the children own their spacing.
        // overflow-hidden would clip an outer focus ring, so a collapsible trigger inside draws it inset.
        flush:
          "gap-0 overflow-hidden py-0 shadow-xs [&_[data-slot=collapsible-trigger]]:focus-visible:ring-inset [&_[data-slot=collapsible-trigger]]:focus-visible:ring-offset-0",
        // Clickable cards: the inner <button> carries the focus ring; the card lifts on hover.
        // data-selected marks the chosen card (e.g. the marketing preview's active tool).
        interactive:
          "relative gap-0 overflow-hidden py-0 shadow-xs transition duration-200 ease-out motion-safe:hover:-translate-y-0.5 hover:shadow-md motion-safe:active:scale-99 data-[selected=true]:shadow-md data-[selected=true]:ring-2 data-[selected=true]:ring-primary/40",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

function Card({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof cardVariants>) {
  return (
    <div
      data-slot="card"
      data-variant={variant ?? "default"}
      className={cn(cardVariants({ variant }), className)}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
        className
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("leading-none font-semibold", className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn("col-start-2 row-span-2 row-start-1 self-start justify-self-end", className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("px-6", className)} {...props} />;
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-6 [.border-t]:pt-6", className)}
      {...props}
    />
  );
}

export { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle };
