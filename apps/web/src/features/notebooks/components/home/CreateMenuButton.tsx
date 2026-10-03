import { ChevronDown, FolderPlus, Plus } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { ButtonGroup, ButtonGroupSeparator } from "@/shared/components/ui/button-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";

/** Primary create action; folders are secondary, so they live in the attached menu. */
export function CreateMenuButton({
  onCreateNotebook,
  onCreateFolder,
}: {
  onCreateNotebook: () => void;
  onCreateFolder: () => void;
}) {
  return (
    <ButtonGroup>
      <Button
        data-onboarding="create-notebook-button"
        aria-label="New notebook"
        onClick={onCreateNotebook}
      >
        <Plus />
        <span className="sm:hidden">New</span>
        <span className="hidden sm:inline">New notebook</span>
      </Button>
      <ButtonGroupSeparator tone="primary" />
      {/* modal={false}: the item opens a dialog (see CardActionsMenu). */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button size="icon" aria-label="More create options" className="h-auto">
            <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onCreateFolder}>
            <FolderPlus />
            New folder
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </ButtonGroup>
  );
}
