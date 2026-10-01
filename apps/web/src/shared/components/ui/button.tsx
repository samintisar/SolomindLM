import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";
import { cn } from "@/shared/utils/cn";

const buttonVariants = cva(
  [
    "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap font-sans text-sm font-semibold tracking-wide",
    "transition-all duration-200 ease-out outline-none",
    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "disabled:pointer-events-none disabled:opacity-50",
    "aria-invalid:border-destructive aria-invalid:ring-destructive/20",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: {
        default:
          "rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/25 dark:shadow-primary/30 hover:-translate-y-px hover:bg-primary/88 hover:shadow-lg hover:shadow-primary/35 dark:hover:shadow-primary/40 active:translate-y-0 active:scale-98 active:bg-primary/95 active:shadow-md",
        destructive:
          "rounded-xl bg-destructive text-destructive-foreground shadow-md shadow-destructive/25 dark:shadow-destructive/35 hover:-translate-y-px hover:bg-destructive/90 hover:shadow-lg hover:shadow-destructive/35 active:translate-y-0 active:scale-98",
        outline:
          "rounded-xl bg-surface-raised shadow-xs ring-1 ring-hairline hover:bg-muted hover:text-foreground active:scale-98 aria-expanded:bg-accent aria-expanded:text-accent-foreground aria-invalid:ring-destructive/60",
        secondary:
          "rounded-xl bg-secondary text-secondary-foreground hover:bg-secondary/70 active:scale-98 aria-expanded:bg-secondary/70",
        ghost:
          "rounded-lg hover:bg-accent hover:text-accent-foreground active:bg-accent/80 aria-expanded:bg-accent aria-expanded:text-accent-foreground",
        "ghost-destructive":
          "rounded-lg text-destructive hover:bg-destructive-muted hover:text-destructive-muted-foreground active:bg-destructive-muted",
        /**
         * Toggle: looks like `ghost` (same base classes, repeated here) until pressed, then holds a
         * destructive tint while `aria-pressed` (e.g. a recording mic).
         */
        "ghost-toggle-destructive":
          "rounded-lg hover:bg-accent hover:text-accent-foreground active:bg-accent/80 aria-pressed:bg-destructive-muted aria-pressed:text-destructive-muted-foreground aria-pressed:hover:bg-destructive-muted aria-pressed:hover:text-destructive-muted-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-6",
        sm: "h-9 px-4 text-xs",
        /** `sm` whose side padding tightens when its nearest `@container` is narrow (toolbars); no-op outside any @container. */
        "sm-adaptive": "h-9 px-4 text-xs @max-md:px-2.5",
        lg: "h-12 px-8 text-base",
        icon: "size-10 rounded-xl",
        "icon-sm": "size-8 rounded-lg",
        /** Icon button as tall as `sm` / `sm-adaptive` (h-9), for toolbars mixing both. */
        "icon-md": "size-9 rounded-lg",
        "icon-lg": "size-12 rounded-xl",
        /** Suggestion chip whose label may run long: grows in height and wraps instead of overflowing. */
        chip: "h-auto min-h-9 px-4 py-2 text-left text-sm font-medium leading-snug whitespace-normal pointer-coarse:min-h-10",
        avatar: "size-8 rounded-full p-0 hover:ring-2 hover:ring-ring/40",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="button"
      data-variant={variant ?? "default"}
      data-size={size ?? "default"}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, type ButtonProps, buttonVariants };
