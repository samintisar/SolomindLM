import { ChevronDown } from "lucide-react";
import { useId, useRef, useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/shared/components/ui/radio-group";
import { ControlTooltip } from "../ControlTooltip";
import { isResearchDatabase, RESEARCH_DATABASES, type ResearchDatabaseOption } from "./constants";

type ResearchDatabaseMenuProps = {
  value: ResearchDatabaseOption;
  onChange: (value: ResearchDatabaseOption) => void;
  disabled?: boolean;
};

export function ResearchDatabaseMenu({ value, onChange, disabled }: ResearchDatabaseMenuProps) {
  const [open, setOpen] = useState(false);
  const idBase = useId();
  const arrowKeyDownRef = useRef(false);
  const headingId = `${idBase}-heading`;
  const current = RESEARCH_DATABASES.find((d) => d.id === value) ?? RESEARCH_DATABASES[0];
  const CurrentIcon = current.icon;
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        // A keyup lost to a window blur would leave the flag stuck; start each opening clean.
        arrowKeyDownRef.current = false;
        setOpen(next);
      }}
    >
      <ControlTooltip label={current.title}>
        <PopoverTrigger asChild disabled={disabled}>
          <Button
            variant="ghost"
            size="sm-adaptive"
            disabled={disabled}
            aria-label={`Research databases: ${current.title}`}
          >
            <CurrentIcon />
            <span className="max-w-52 min-w-0 truncate @max-xl/chat-input:sr-only">
              {current.title}
            </span>
            <ChevronDown className="@max-xs/chat-input:hidden" />
          </Button>
        </PopoverTrigger>
      </ControlTooltip>
      <PopoverContent
        side="top"
        align="start"
        collisionPadding={16}
        className="max-h-(--radix-popover-content-available-height) w-80 max-w-(--radix-popover-content-available-width) overflow-y-auto overscroll-contain"
      >
        <p id={headingId} className="mb-2 font-sans text-xs font-medium text-muted-foreground">
          Research databases
        </p>
        {/* Radix selects an item by clicking it when an arrow key moves focus onto it, so the
            popover must not close on that click or on the value change: only a pointer click, Space
            or Enter closes it. */}
        <RadioGroup
          aria-labelledby={headingId}
          density="compact"
          onKeyDownCapture={(e) => {
            arrowKeyDownRef.current = e.key.startsWith("Arrow");
          }}
          onKeyUp={() => {
            arrowKeyDownRef.current = false;
          }}
          onPointerDown={() => {
            arrowKeyDownRef.current = false;
          }}
          value={value}
          onValueChange={(next) => {
            if (isResearchDatabase(next)) onChange(next);
          }}
        >
          {RESEARCH_DATABASES.map(({ id, title, description, icon: Icon }) => {
            const titleId = `${idBase}-${id}-title`;
            const descId = `${idBase}-${id}-desc`;
            return (
              <label
                key={id}
                className="flex cursor-pointer items-start gap-3 rounded-lg p-2 font-sans text-sm hover:bg-accent has-data-[state=checked]:bg-primary/5"
              >
                <RadioGroupItem
                  value={id}
                  aria-labelledby={titleId}
                  aria-describedby={descId}
                  className="mt-0.5"
                  onClick={() => {
                    if (!arrowKeyDownRef.current) setOpen(false);
                  }}
                  onKeyDown={(e) => {
                    // Radix suppresses Enter on radios; treat it as "choose this and close".
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    onChange(id);
                    setOpen(false);
                  }}
                />
                <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-foreground/85" />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span id={titleId} className="leading-tight font-semibold text-foreground">
                    {title}
                  </span>
                  <span id={descId} className="text-xs leading-snug text-muted-foreground">
                    {description}
                  </span>
                </span>
              </label>
            );
          })}
        </RadioGroup>
      </PopoverContent>
    </Popover>
  );
}
