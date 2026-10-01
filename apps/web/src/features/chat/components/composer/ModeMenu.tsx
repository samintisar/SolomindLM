import { ChevronDown } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { cn } from "@/shared/utils/cn";
import { type ChatComposerMode, COMPOSER_MODES } from "./constants";

type ModeMenuProps = {
  mode: ChatComposerMode;
  onModeChange: (mode: ChatComposerMode) => void;
  disabled?: boolean;
  /**
   * The toolbar is crowded (the research database picker is showing), so the label drops at a
   * wider composer width. Widths are container queries on the composer, not the viewport.
   */
  crowded?: boolean;
};

export function ModeMenu({ mode, onModeChange, disabled, crowded = false }: ModeMenuProps) {
  const current = COMPOSER_MODES.find((m) => m.id === mode) ?? COMPOSER_MODES[0];
  const Icon = current.icon;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          aria-label={`Composer mode: ${current.label}`}
        >
          <Icon />
          <span
            className={cn(crowded ? "@max-md/chat-input:sr-only" : "@max-xs/chat-input:sr-only")}
          >
            {current.label}
          </span>
          <ChevronDown className="@max-xs/chat-input:hidden" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-60">
        <DropdownMenuLabel>Mode</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={mode}
          onValueChange={(value) => onModeChange(value as ChatComposerMode)}
        >
          {COMPOSER_MODES.map(({ id, label, icon: ItemIcon }) => (
            <DropdownMenuRadioItem key={id} value={id}>
              <ItemIcon />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
