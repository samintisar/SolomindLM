import { Switch as SwitchPrimitive } from "radix-ui";
import type * as React from "react";
import { cn } from "@/shared/utils/cn";

function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer inline-flex h-5 w-9 shrink-0 items-center rounded-full shadow-xs transition-colors outline-none",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "data-[state=checked]:bg-primary data-[state=unchecked]:bg-muted-foreground/30",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block size-4 rounded-full shadow-sm ring-0 transition-transform",
          "data-[state=checked]:translate-x-4.5 data-[state=checked]:bg-primary-foreground",
          "data-[state=unchecked]:translate-x-0.5 data-[state=unchecked]:bg-surface-raised"
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
