import { Bookmark, GitFork, X } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/shared/components/ui/field";
import { Textarea } from "@/shared/components/ui/textarea";
import { SaveAsPromptModal } from "./SaveAsPromptModal";
import { StudioModalDiscoverPromptsButton } from "./StudioModalDiscoverPromptsButton";

export interface MindMapConfig {
  customPrompt: string;
}

interface CustomizeMindMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (config: MindMapConfig) => void;
}

/**
 * Same overlay shell as the other Customize dialogs (not the shared Dialog): the Discover and Save
 * prompt modals open on top of it as fixed overlays, which a transformed Dialog would trap.
 */
export function CustomizeMindMapModal({ isOpen, onClose, onGenerate }: CustomizeMindMapModalProps) {
  const [customPrompt, setCustomPrompt] = useState("");
  const [saveAsPromptModalOpen, setSaveAsPromptModalOpen] = useState(false);
  const promptId = useId();
  const titleId = useId();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-overlay backdrop-blur-xs" onClick={onClose} />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-full w-full max-w-2xl flex-col gap-6 overflow-y-auto rounded-2xl bg-card p-6 text-card-foreground shadow-xl ring-1 ring-hairline"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <GitFork aria-hidden className="size-5 text-primary" />
            <h2 id={titleId} className="font-sans text-xl font-bold tracking-tight">
              Customize Mind Map
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <StudioModalDiscoverPromptsButton
              studioTool="mindmap"
              onApplyPrompt={setCustomPrompt}
            />
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
              <X aria-hidden />
            </Button>
          </div>
        </div>

        <Field>
          <FieldLabel htmlFor={promptId}>Custom prompt</FieldLabel>
          <FieldDescription>
            Optional. Say what the map should focus on or how to organize it. Only your selected
            sources are used.
          </FieldDescription>
          <Textarea
            id={promptId}
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            placeholder="e.g. Focus on the cardiac cycle, or organize by cause and effect..."
            className="h-36 resize-none"
          />
          <Button
            variant="ghost"
            size="sm"
            className="w-fit"
            onClick={() => setSaveAsPromptModalOpen(true)}
            disabled={!customPrompt.trim()}
          >
            <Bookmark aria-hidden />
            Save as reusable prompt
          </Button>
        </Field>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onGenerate({ customPrompt })}>Generate Mind Map</Button>
        </div>
      </div>

      <SaveAsPromptModal
        isOpen={saveAsPromptModalOpen}
        onClose={() => setSaveAsPromptModalOpen(false)}
        studioTool="mindmap"
        initialPromptText={customPrompt}
      />
    </div>
  );
}
