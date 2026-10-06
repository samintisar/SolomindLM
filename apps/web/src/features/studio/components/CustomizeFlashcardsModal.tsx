import type React from "react";
import { useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { FieldGroup } from "@/shared/components/ui/field";
import type { StudioDialogTheme } from "./customize/dialogTheme";
import { OptionToggleGroup } from "./customize/OptionToggleGroup";
import { COUNT_OPTIONS, DIFFICULTY_OPTIONS } from "./customize/options";
import { PromptField } from "./customize/PromptField";
import {
  StudioCustomizeBody,
  StudioCustomizeDialog,
  StudioCustomizeFooter,
  StudioCustomizeHeader,
} from "./customize/StudioCustomizeDialog";

interface CustomizeFlashcardsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (config: FlashcardConfig) => void;
  /** When true, opens inside a positioned parent (a preview mock-up) instead of the viewport. */
  embedded?: boolean;
  /** Pins light-theme tokens on always-light pages (the auth page). */
  theme?: StudioDialogTheme;
  /** A marketing mock-up (landing, sign-in): hides Discover Prompts and Save as reusable prompt. */
  preview?: boolean;
}

export interface FlashcardConfig {
  count: "fewer" | "standard" | "more";
  difficulty: "easy" | "medium" | "hard";
  topic: string;
}

export const CustomizeFlashcardsModal: React.FC<CustomizeFlashcardsModalProps> = ({
  isOpen,
  onClose,
  onGenerate,
  embedded = false,
  theme,
  preview = false,
}) => (
  <StudioCustomizeDialog
    open={isOpen}
    onClose={onClose}
    embedded={embedded}
    theme={theme}
    preview={preview}
  >
    <FlashcardsForm onGenerate={onGenerate} />
  </StudioCustomizeDialog>
);

// Inside DialogContent, which unmounts on close: every open starts from the defaults.
function FlashcardsForm({ onGenerate }: { onGenerate: (config: FlashcardConfig) => void }) {
  const [count, setCount] = useState<FlashcardConfig["count"]>("standard");
  const [difficulty, setDifficulty] = useState<FlashcardConfig["difficulty"]>("medium");
  const [topic, setTopic] = useState("");
  return (
    <>
      <StudioCustomizeHeader
        kind="flashcard"
        title="Customize Flashcards"
        description="Choose how many cards to make, how hard they are, and what to focus on."
        promptLibrary={{ studioTool: "flashcards", onApplyPrompt: setTopic }}
      />
      <StudioCustomizeBody>
        <FieldGroup className="grid sm:grid-cols-2">
          <OptionToggleGroup
            label="Number of cards"
            value={count}
            options={COUNT_OPTIONS}
            onValueChange={setCount}
          />
          <OptionToggleGroup
            label="Difficulty"
            value={difficulty}
            options={DIFFICULTY_OPTIONS}
            onValueChange={setDifficulty}
          />
        </FieldGroup>
        <PromptField
          label="Area of focus"
          placeholder="e.g. Focus on 'Relational Algebra' or 'Keep card fronts under 3 words'..."
          value={topic}
          onChange={setTopic}
          studioTool="flashcards"
        />
      </StudioCustomizeBody>
      <StudioCustomizeFooter>
        <Button onClick={() => onGenerate({ count, difficulty, topic })}>Generate Cards</Button>
      </StudioCustomizeFooter>
    </>
  );
}
