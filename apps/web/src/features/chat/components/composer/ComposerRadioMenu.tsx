import { ChevronDown, type LucideIcon } from "lucide-react";
import { useId, useRef, useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/shared/components/ui/radio-group";
import { ControlTooltip } from "../ControlTooltip";

export interface ComposerRadioOption<T extends string> {
  id: T;
  title: string;
  description: string;
  icon: LucideIcon;
}

type ComposerRadioMenuProps<T extends string> = {
  /** Popover heading, also the trigger's accessible-name prefix ("Heading: Current option"). */
  heading: string;
  options: readonly ComposerRadioOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
};

/** A composer toolbar button that opens a single-choice list of options with descriptions. */
export function ComposerRadioMenu<T extends string>({
  heading,
  options,
  value,
  onChange,
  disabled,
}: ComposerRadioMenuProps<T>) {
  const [open, setOpen] = useState(false);
  const idBase = useId();
  const arrowKeyDownRef = useRef(false);
  const headingId = `${idBase}-heading`;
  const current = options.find((o) => o.id === value) ?? options[0];
  const CurrentIcon = current.icon;
  const choose = (next: string) => {
    const option = options.find((o) => o.id === next);
    if (option) onChange(option.id);
  };
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
            aria-label={`${heading}: ${current.title}`}
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
          {heading}
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
          onValueChange={choose}
        >
          {options.map(({ id, title, description, icon: Icon }) => {
            const titleId = `${idBase}-${id}-title`;
            const descId = `${idBase}-${id}-desc`;
            return (
              <label
                key={id}
                className="flex cursor-pointer items-start gap-3 rounded-lg p-2 font-sans text-sm hover:bg-muted has-data-[state=checked]:bg-accent/60"
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
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                  <Icon aria-hidden className="size-4" />
                </span>
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
