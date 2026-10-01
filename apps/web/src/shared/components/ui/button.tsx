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
          "rounded-xl border-2 border-input bg-background hover:border-primary/40 hover:bg-accent/60 hover:text-accent-foreground active:scale-98 aria-expanded:bg-accent aria-expanded:text-accent-foreground",
        secondary:
          "rounded-xl bg-secondary text-secondary-foreground hover:bg-secondary/80 active:scale-98",
        ghost:
          "rounded-lg hover:bg-accent hover:text-accent-foreground active:bg-accent/80 aria-expanded:bg-accent aria-expanded:text-accent-foreground",
        "ghost-destructive":
          "rounded-lg text-destructive hover:bg-destructive-muted hover:text-destructive-muted-foreground active:bg-destructive-muted",
        /** Ghost toggle that turns destructive while pressed (`aria-pressed`), e.g. a recording mic. */
        "ghost-record":
          "rounded-lg hover:bg-accent hover:text-accent-foreground active:bg-accent/80 aria-pressed:bg-destructive-muted aria-pressed:text-destructive-muted-foreground aria-pressed:hover:bg-destructive-muted aria-pressed:hover:text-destructive-muted-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-6",
        sm: "h-9 px-4 text-xs",
        /** `sm` whose side padding tightens when its nearest `@container` is narrow (toolbars). */
        "sm-adaptive": "h-9 px-4 text-xs @max-md:px-2.5",
        lg: "h-12 px-8 text-base",
        icon: "size-10 rounded-xl",
        "icon-sm": "size-8 rounded-lg",
        "icon-lg": "size-12 rounded-xl",
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
