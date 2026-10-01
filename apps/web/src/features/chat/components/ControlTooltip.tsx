import type React from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/components/ui/tooltip";

/**
 * Opens a control tooltip only for keyboard focus. Popover and DropdownMenu hand focus back to their trigger
 * when they close; without this the tooltip would pop open then (and stick on touch). Radix skips its own
 * focus handler when the event is default-prevented.
 */
const openTooltipOnFocusVisibleOnly = (e: React.FocusEvent<HTMLElement>) => {
  if (!e.currentTarget.matches(":focus-visible")) e.preventDefault();
};

/** Hover/focus label for an icon-only control. `children` is the trigger (a Button, or a Popover/DropdownMenu trigger around one). */
export function ControlTooltip({
  label,
  children,
}: {
  label: string;
  children: React.ReactElement;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild onFocus={openTooltipOnFocusVisibleOnly}>
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
