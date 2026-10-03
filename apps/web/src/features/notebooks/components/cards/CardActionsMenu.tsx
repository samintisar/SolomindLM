import { type LucideIcon, MoreVertical } from "lucide-react";
import { Fragment } from "react";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";

export interface CardAction {
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  destructive?: boolean;
}

/**
 * `modal={false}`: these items open Radix dialogs; a modal menu closing into a modal dialog can
 * leave `pointer-events: none` stuck on <body>.
 */
export function CardActionsMenu({ label, actions }: { label: string; actions: CardAction[] }) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label}>
          <MoreVertical />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {actions.map(({ label: itemLabel, icon: Icon, onSelect, destructive }) => (
          <Fragment key={itemLabel}>
            {destructive && <DropdownMenuSeparator />}
            <DropdownMenuItem variant={destructive ? "destructive" : "default"} onSelect={onSelect}>
              <Icon />
              {itemLabel}
            </DropdownMenuItem>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
