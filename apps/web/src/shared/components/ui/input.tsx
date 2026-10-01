import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/shared/utils/cn";

const inputVariants = cva(
  [
    "w-full min-w-0 rounded-lg bg-muted/40 py-1 font-sans ring-1 ring-hairline shadow-none transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
    "focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-ring/40",
    "aria-invalid:ring-destructive/60",
  ],
  {
    variants: {
      size: {
        default: "h-9 px-3 text-base md:text-sm",
        /** Matches the default `Button` height (h-11) for forms that pair inputs with buttons. */
        lg: "h-11 px-3.5 text-base",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
);

type InputProps = Omit<React.ComponentProps<"input">, "size"> & VariantProps<typeof inputVariants>;

function Input({ className, type, size, ...props }: InputProps) {
  return (
    <input
      type={type}
      data-slot="input"
      data-size={size ?? "default"}
      className={cn(inputVariants({ size }), className)}
      {...props}
    />
  );
}

export { Input };
