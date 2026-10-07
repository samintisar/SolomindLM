import type React from "react";
import { useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { FieldGroup } from "@/shared/components/ui/field";
import { OptionToggleGroup } from "./customize/OptionToggleGroup";
import { COUNT_OPTIONS, DIFFICULTY_OPTIONS, type ToggleOption } from "./customize/options";
import { PromptField } from "./customize/PromptField";
import {
  StudioCustomizeBody,
  StudioCustomizeDialog,
  StudioCustomizeFooter,
  StudioCustomizeHeader,
  type StudioCustomizeModalProps,
} from "./customize/StudioCustomizeDialog";

type CustomizeWrittenQuestionsModalProps = StudioCustomizeModalProps<WrittenQuestionsConfig>;

export interface WrittenQuestionsConfig {
  count: "fewer" | "standard" | "more";
  difficulty: "easy" | "medium" | "hard";
  questionType: "short" | "essay";
  focus: string;
}

const QUESTION_TYPE_OPTIONS = [
  { value: "short", label: "Short" },
  { value: "essay", label: "Essay" },
] as const satisfies readonly ToggleOption<WrittenQuestionsConfig["questionType"]>[];

export const CustomizeWrittenQuestionsModal: React.FC<CustomizeWrittenQuestionsModalProps> = ({
  isOpen,
  onGenerate,
  ...dialogProps
}) => (
  <StudioCustomizeDialog open={isOpen} {...dialogProps} wide>
    <WrittenQuestionsForm onGenerate={onGenerate} />
  </StudioCustomizeDialog>
);

// Inside DialogContent, which unmounts on close: every open starts from the defaults.
function WrittenQuestionsForm({
  onGenerate,
}: {
  onGenerate: (config: WrittenQuestionsConfig) => void;
}) {
  const [count, setCount] = useState<WrittenQuestionsConfig["count"]>("standard");
  const [difficulty, setDifficulty] = useState<WrittenQuestionsConfig["difficulty"]>("medium");
  const [questionType, setQuestionType] = useState<WrittenQuestionsConfig["questionType"]>("short");
  const [focus, setFocus] = useState("");
  return (
    <>
      <StudioCustomizeHeader
        kind="written"
        title="Customize Written Questions"
        description="Choose how many questions, their type and difficulty, and what to focus on."
        promptLibrary={{ studioTool: "writtenQuestions", onApplyPrompt: setFocus }}
      />
      <StudioCustomizeBody>
        <FieldGroup className="grid lg:grid-cols-3">
          <OptionToggleGroup
            label="Number of questions"
            value={count}
            options={COUNT_OPTIONS}
            onValueChange={setCount}
          />
          <OptionToggleGroup
            label="Question type"
            value={questionType}
            options={QUESTION_TYPE_OPTIONS}
            onValueChange={setQuestionType}
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
          placeholder="e.g. Focus on 'Database Normalization' concepts or create a comprehensive review..."
          value={focus}
          onChange={setFocus}
          studioTool="writtenQuestions"
        />
      </StudioCustomizeBody>
      <StudioCustomizeFooter>
        <Button onClick={() => onGenerate({ count, difficulty, questionType, focus })}>
          Generate Written Questions
        </Button>
      </StudioCustomizeFooter>
    </>
  );
}
