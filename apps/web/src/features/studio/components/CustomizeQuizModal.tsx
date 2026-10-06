import type React from "react";
import { useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { FieldGroup } from "@/shared/components/ui/field";
import type { StudioDialogTheme } from "./customize/dialogContext";
import { OptionToggleGroup } from "./customize/OptionToggleGroup";
import { COUNT_OPTIONS, DIFFICULTY_OPTIONS } from "./customize/options";
import { PromptField } from "./customize/PromptField";
import {
  StudioCustomizeBody,
  StudioCustomizeDialog,
  StudioCustomizeFooter,
  StudioCustomizeHeader,
} from "./customize/StudioCustomizeDialog";

interface CustomizeQuizModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (config: QuizConfig) => void;
  /** When true, opens inside a positioned parent (a preview mock-up) instead of the viewport. */
  embedded?: boolean;
  /** Pins light-theme tokens on always-light pages (the auth page). */
  theme?: StudioDialogTheme;
  /** A marketing mock-up (landing, sign-in): hides Discover Prompts and Save as reusable prompt. */
  preview?: boolean;
}

export interface QuizConfig {
  count: "fewer" | "standard" | "more";
  difficulty: "easy" | "medium" | "hard";
  focus: string;
}

export const CustomizeQuizModal: React.FC<CustomizeQuizModalProps> = ({
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
    <QuizForm onGenerate={onGenerate} />
  </StudioCustomizeDialog>
);

// Inside DialogContent, which unmounts on close: every open starts from the defaults.
function QuizForm({ onGenerate }: { onGenerate: (config: QuizConfig) => void }) {
  const [count, setCount] = useState<QuizConfig["count"]>("standard");
  const [difficulty, setDifficulty] = useState<QuizConfig["difficulty"]>("medium");
  const [focus, setFocus] = useState("");
  return (
    <>
      <StudioCustomizeHeader
        kind="quiz"
        title="Customize Quiz"
        description="Choose how many questions, how hard they are, and what to focus on."
        promptLibrary={{ studioTool: "quiz", onApplyPrompt: setFocus }}
      />
      <StudioCustomizeBody>
        <FieldGroup className="grid sm:grid-cols-2">
          <OptionToggleGroup
            label="Number of questions"
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
          placeholder="e.g. Create a 'Final Exam' style review or focus on 'Boyce-Codd Normal Form'..."
          value={focus}
          onChange={setFocus}
          studioTool="quiz"
        />
      </StudioCustomizeBody>
      <StudioCustomizeFooter>
        <Button onClick={() => onGenerate({ count, difficulty, focus })}>Generate Quiz</Button>
      </StudioCustomizeFooter>
    </>
  );
}
