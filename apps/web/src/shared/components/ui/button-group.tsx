import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import { cn } from "@/shared/utils/cn";

const buttonGroupVariants = cva(
  // Segments move as one button: the per-button hover lift/press scale is cancelled inside a group.
  "flex w-fit items-stretch has-[>[data-slot=button-group]]:gap-2 [&>*]:hover:translate-y-0 [&>*]:active:scale-100 [&>*]:focus-visible:relative [&>*]:focus-visible:z-10 has-[select[aria-hidden=true]:last-child]:[&>[data-slot=select-trigger]:last-of-type]:rounded-r-md [&>[data-slot=select-trigger]:not([class*='w-'])]:w-fit [&>input]:flex-1",
  {
    variants: {
      orientation: { horizontal: "", vertical: "flex-col" },
      variant: {
        default: "",
        // Icon-action tray: a tinted pill; the open/pressed segment is raised onto a card chip.
        tray: "items-center gap-0.5 rounded-xl bg-secondary p-0.5 [&>*]:rounded-lg [&>[aria-expanded=true]]:bg-surface-raised [&>[aria-expanded=true]]:shadow-xs [&>[aria-pressed=true]:not([data-variant=ghost-toggle-destructive])]:bg-surface-raised [&>[aria-pressed=true]:not([data-variant=ghost-toggle-destructive])]:shadow-xs",
      },
    },
    compoundVariants: [
      {
        variant: "default",
        orientation: "horizontal",
        class:
          "[&>*:not(:first-child)]:rounded-l-none [&>*:not(:first-child)]:border-l-0 [&>*:not(:last-child)]:rounded-r-none",
      },
      {
        variant: "default",
        orientation: "vertical",
        class:
          "[&>*:not(:first-child)]:rounded-t-none [&>*:not(:first-child)]:border-t-0 [&>*:not(:last-child)]:rounded-b-none",
      },
    ],
    defaultVariants: { orientation: "horizontal", variant: "default" },
  }
);

function ButtonGroup({
  className,
  orientation,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof buttonGroupVariants>) {
  return (
    <div
      role="group"
      data-slot="button-group"
      data-orientation={orientation}
      data-variant={variant ?? "default"}
      className={cn(buttonGroupVariants({ orientation, variant }), className)}
      {...props}
    />
  );
}

function ButtonGroupText({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<"div"> & {
  asChild?: boolean;
}) {
  const Comp = asChild ? Slot.Root : "div";

  return (
    <Comp
      className={cn(
        "flex items-center gap-2 rounded-lg bg-muted px-4 text-sm font-medium ring-1 ring-hairline [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  );
}

const buttonGroupSeparatorVariants = cva("relative shrink-0 self-stretch", {
  variants: {
    orientation: { vertical: "w-px", horizontal: "h-px" },
    // `primary`: a soft seam between filled primary segments instead of a light page border.
    tone: { default: "bg-border", primary: "bg-primary-foreground/25" },
  },
  defaultVariants: { orientation: "vertical", tone: "default" },
});

function ButtonGroupSeparator({
  className,
  orientation,
  tone,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof buttonGroupSeparatorVariants>) {
  return (
    <div
      role="separator"
      aria-orientation={orientation ?? "vertical"}
      data-slot="button-group-separator"
      className={cn(buttonGroupSeparatorVariants({ orientation, tone }), className)}
      {...props}
    />
  );
}

export { ButtonGroup, ButtonGroupSeparator, ButtonGroupText, buttonGroupVariants };
