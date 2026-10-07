import { ChevronDown } from "lucide-react";
import { useShowProBadges } from "@/features/billing/hooks/useShowProBadges";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItemDescription,
  DropdownMenuItemIcon,
  DropdownMenuItemText,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { cn } from "@/shared/utils/cn";
import { ControlTooltip } from "../ControlTooltip";
import { type ChatComposerMode, COMPOSER_MODES, isComposerMode } from "./constants";

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
  const showProBadges = useShowProBadges();
  const current = COMPOSER_MODES.find((m) => m.id === mode) ?? COMPOSER_MODES[0];
  const Icon = current.icon;
  return (
    <DropdownMenu>
      <ControlTooltip label={current.label}>
        <DropdownMenuTrigger asChild disabled={disabled}>
          <Button
            variant="ghost"
            size="sm-adaptive"
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
      </ControlTooltip>
      <DropdownMenuContent side="top" align="start" className="w-72">
        <DropdownMenuLabel>Mode</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={mode}
          onValueChange={(value) => {
            if (isComposerMode(value)) onModeChange(value);
          }}
        >
          {COMPOSER_MODES.map(({ id, label, icon: ItemIcon, description }) => (
            <DropdownMenuRadioItem key={id} value={id}>
              <DropdownMenuItemIcon>
                <ItemIcon />
              </DropdownMenuItemIcon>
              <DropdownMenuItemText>
                <span className="flex items-center gap-1.5">
                  {label}
                  {showProBadges && id === "deepResearch" ? (
                    <Badge variant="secondary">Pro</Badge>
                  ) : null}
                </span>
                <DropdownMenuItemDescription>{description}</DropdownMenuItemDescription>
              </DropdownMenuItemText>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
