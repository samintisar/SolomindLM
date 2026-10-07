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

type CustomizeQuizModalProps = StudioCustomizeModalProps<QuizConfig>;

export interface QuizConfig {
  count: "fewer" | "standard" | "more";
  difficulty: "easy" | "medium" | "hard";
  focus: string;
}

export const CustomizeQuizModal: React.FC<CustomizeQuizModalProps> = ({
  isOpen,
  onGenerate,
  ...dialogProps
}) => (
  <StudioCustomizeDialog open={isOpen} {...dialogProps}>
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
