import * as React from "react";
import { cn } from "@/shared/utils/cn";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-lg bg-muted/40 px-3 py-2 text-base ring-1 ring-hairline shadow-none transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-destructive md:text-sm",
        className
      )}
      {...props}
    />
  );
}

export { Textarea };
