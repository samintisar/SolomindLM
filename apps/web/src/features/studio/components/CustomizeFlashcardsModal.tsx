import type React from "react";
import { useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { FieldGroup } from "@/shared/components/ui/field";
import { OptionToggleGroup } from "./customize/OptionToggleGroup";
import { COUNT_OPTIONS, DIFFICULTY_OPTIONS } from "./customize/options";
import { PromptField } from "./customize/PromptField";
import {
  StudioCustomizeBody,
  StudioCustomizeDialog,
  StudioCustomizeFooter,
  StudioCustomizeHeader,
  type StudioCustomizeModalProps,
} from "./customize/StudioCustomizeDialog";

type CustomizeFlashcardsModalProps = StudioCustomizeModalProps<FlashcardConfig>;

export interface FlashcardConfig {
  count: "fewer" | "standard" | "more";
  difficulty: "easy" | "medium" | "hard";
  topic: string;
}

export const CustomizeFlashcardsModal: React.FC<CustomizeFlashcardsModalProps> = ({
  isOpen,
  onGenerate,
  ...dialogProps
}) => (
  <StudioCustomizeDialog open={isOpen} {...dialogProps}>
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
