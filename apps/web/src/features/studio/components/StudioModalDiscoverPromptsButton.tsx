import { Compass } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import type { StudioTool } from "../services/promptsApi";
import { DiscoverStudioPromptsModal } from "./DiscoverStudioPromptsModal";

interface StudioModalDiscoverPromptsButtonProps {
  studioTool: StudioTool;
  onApplyPrompt: (promptText: string) => void;
  /** See DiscoverStudioPromptsModal: where focus goes after a prompt is applied. */
  focusAfterApply?: () => HTMLElement | null;
}

/** Opens the prompt library from a Customize dialog; a chosen prompt fills that dialog's prompt. */
export function StudioModalDiscoverPromptsButton({
  studioTool,
  onApplyPrompt,
  focusAfterApply,
}: StudioModalDiscoverPromptsButtonProps) {
  return (
    <DiscoverStudioPromptsModal
      studioTool={studioTool}
      onApplyPrompt={onApplyPrompt}
      focusAfterApply={focusAfterApply}
      trigger={
        <Button variant="outline" size="sm">
          <Compass data-icon="inline-start" />
          {/* Icon-only on phones, where the dialog header is narrow; the name stays for screen readers. */}
          <span className="max-sm:sr-only">Discover Prompts</span>
        </Button>
      }
    />
  );
}
