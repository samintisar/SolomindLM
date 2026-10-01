import { resolveSmartModel } from "@convex/_lib/resolveSmartModel";
import { ChevronDown } from "lucide-react";
import { ModelBrandIcon } from "@/shared/components/icons/ModelBrandIcon";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { AVAILABLE_SMART_MODELS, findSmartModelById } from "@/shared/constants/models";
import { cn } from "@/shared/utils/cn";

type ModelMenuProps = {
  /** Saved model id; unknown or missing values resolve to the default model. */
  value?: string;
  onModelChange: (modelId: string) => void;
  disabled?: boolean;
  /** Icon-only trigger, for a crowded toolbar. */
  hideLabel?: boolean;
};

export function ModelMenu({ value, onModelChange, disabled, hideLabel = false }: ModelMenuProps) {
  const selectedId = resolveSmartModel(value);
  const current = findSmartModelById(selectedId);
  const name = current?.name ?? "DeepSeek V4.1 Flash";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" disabled={disabled} aria-label={`Model: ${name}`}>
          <ModelBrandIcon brand={current?.brand ?? "deepseek"} />
          <span className={cn("truncate", hideLabel ? "sr-only" : "@max-4xl/chat-input:sr-only")}>
            {name}
          </span>
          <ChevronDown className="@max-xs/chat-input:hidden" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="end" className="min-w-54">
        <DropdownMenuLabel>Model</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={selectedId} onValueChange={onModelChange}>
          {AVAILABLE_SMART_MODELS.map((model) => (
            <DropdownMenuRadioItem key={model.id} value={model.id}>
              <ModelBrandIcon brand={model.brand} />
              {model.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
