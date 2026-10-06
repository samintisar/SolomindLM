import { useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { PromptField } from "./customize/PromptField";
import {
  StudioCustomizeBody,
  StudioCustomizeDialog,
  StudioCustomizeFooter,
  StudioCustomizeHeader,
} from "./customize/StudioCustomizeDialog";

export interface MindMapConfig {
  customPrompt: string;
}

interface CustomizeMindMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (config: MindMapConfig) => void;
}

export function CustomizeMindMapModal({ isOpen, onClose, onGenerate }: CustomizeMindMapModalProps) {
  return (
    <StudioCustomizeDialog open={isOpen} onClose={onClose}>
      <MindMapForm onGenerate={onGenerate} />
    </StudioCustomizeDialog>
  );
}

// Inside DialogContent, which unmounts on close: every open starts with an empty prompt.
function MindMapForm({ onGenerate }: { onGenerate: (config: MindMapConfig) => void }) {
  const [customPrompt, setCustomPrompt] = useState("");
  return (
    <>
      <StudioCustomizeHeader
        kind="mindmap"
        title="Customize Mind Map"
        description="Map the main topics of your selected sources."
        promptLibrary={{ studioTool: "mindmap", onApplyPrompt: setCustomPrompt }}
      />
      <StudioCustomizeBody>
        <PromptField
          label="Custom prompt"
          description="Optional. Say what the map should focus on or how to organize it. Only your selected sources are used."
          placeholder="e.g. Focus on the cardiac cycle, or organize by cause and effect..."
          value={customPrompt}
          onChange={setCustomPrompt}
          studioTool="mindmap"
        />
      </StudioCustomizeBody>
      <StudioCustomizeFooter>
        <Button onClick={() => onGenerate({ customPrompt })}>Generate Mind Map</Button>
      </StudioCustomizeFooter>
    </>
  );
}
