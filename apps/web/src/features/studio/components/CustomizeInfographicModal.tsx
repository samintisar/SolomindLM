import type React from "react";
import { useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { FieldGroup, FieldLegend, FieldSet } from "@/shared/components/ui/field";
import type { StudioDialogTheme } from "./customize/dialogContext";
import { InfographicStyleThumbnail } from "./customize/InfographicStyleThumbnail";
import { OptionCard } from "./customize/OptionCard";
import { OptionToggleGroup } from "./customize/OptionToggleGroup";
import type { ToggleOption } from "./customize/options";
import { PromptField } from "./customize/PromptField";
import {
  StudioCustomizeBody,
  StudioCustomizeDialog,
  StudioCustomizeFooter,
  StudioCustomizeHeader,
} from "./customize/StudioCustomizeDialog";

interface VisualStyle {
  id: string;
  label: string;
  hint: string;
}

const VISUAL_STYLES: VisualStyle[] = [
  { id: "auto", label: "Auto-select", hint: "Balanced layout and palette from your content" },
  { id: "sketch_note", label: "Sketch Note", hint: "Loose lines, markers, and handwritten labels" },
  { id: "kawaii", label: "Kawaii", hint: "Soft pastels, rounded shapes, friendly emphasis" },
  {
    id: "professional",
    label: "Professional",
    hint: "Clean grids, restrained color, crisp hierarchy",
  },
  { id: "scientific", label: "Scientific", hint: "Diagrams, scales, and precise annotations" },
  { id: "anime", label: "Anime", hint: "Bold color blocks, expressive outlines, motion cues" },
  { id: "clay", label: "Clay", hint: "Soft volumes, gentle shadows, tactile surfaces" },
  { id: "editorial", label: "Editorial", hint: "Magazine rhythm, strong headline, column flow" },
  {
    id: "instructional",
    label: "Instructional",
    hint: "Numbered flow, clear steps, minimal decoration",
  },
  { id: "bento_grid", label: "Bento Grid", hint: "Modular tiles with varied weights and spacing" },
  { id: "bricks", label: "Bricks", hint: "Stacked blocks with mortar rhythm and repetition" },
];

const ORIENTATION_OPTIONS = [
  { value: "landscape", label: "Landscape" },
  { value: "portrait", label: "Portrait" },
  { value: "square", label: "Square" },
] as const satisfies readonly ToggleOption<InfographicConfig["orientation"]>[];

const DETAIL_OPTIONS = [
  { value: "concise", label: "Concise" },
  { value: "standard", label: "Standard" },
] as const satisfies readonly ToggleOption<InfographicConfig["detailLevel"]>[];

interface CustomizeInfographicModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (config: InfographicConfig) => void;
  /** When true, opens inside a positioned parent (a preview mock-up) instead of the viewport. */
  embedded?: boolean;
  /** Pins light-theme tokens on always-light pages (the auth page). */
  theme?: StudioDialogTheme;
  /** A marketing mock-up (landing, sign-in): hides Discover Prompts and Save as reusable prompt. */
  preview?: boolean;
}

export interface InfographicConfig {
  orientation: "landscape" | "portrait" | "square";
  visualStyle: string;
  detailLevel: "concise" | "standard";
  customPrompt: string;
}

export const CustomizeInfographicModal: React.FC<CustomizeInfographicModalProps> = ({
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
    wide
  >
    <InfographicForm onGenerate={onGenerate} />
  </StudioCustomizeDialog>
);

// Inside DialogContent, which unmounts on close: every open starts from the defaults.
function InfographicForm({ onGenerate }: { onGenerate: (config: InfographicConfig) => void }) {
  const [orientation, setOrientation] = useState<InfographicConfig["orientation"]>("landscape");
  const [visualStyle, setVisualStyle] = useState("auto");
  const [detailLevel, setDetailLevel] = useState<InfographicConfig["detailLevel"]>("standard");
  const [customPrompt, setCustomPrompt] = useState("");
  return (
    <>
      <StudioCustomizeHeader
        kind="infographic"
        title="Customize Infographic"
        description="Pick an orientation, a level of detail and a visual style."
        promptLibrary={{ studioTool: "infographic", onApplyPrompt: setCustomPrompt }}
      />
      <StudioCustomizeBody>
        <FieldGroup className="grid sm:grid-cols-2">
          <OptionToggleGroup
            label="Orientation"
            value={orientation}
            options={ORIENTATION_OPTIONS}
            onValueChange={setOrientation}
          />
          <OptionToggleGroup
            label="Level of detail"
            value={detailLevel}
            options={DETAIL_OPTIONS}
            onValueChange={setDetailLevel}
          />
        </FieldGroup>
        <FieldSet>
          <FieldLegend variant="label">Visual style</FieldLegend>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {VISUAL_STYLES.map((style) => (
              <OptionCard
                key={style.id}
                title={style.label}
                description={style.hint}
                selected={visualStyle === style.id}
                onSelect={() => setVisualStyle(style.id)}
                media={<InfographicStyleThumbnail styleId={style.id} />}
              />
            ))}
          </div>
        </FieldSet>
        <PromptField
          label="Describe the infographic you want to create"
          placeholder={
            'Guide the style, color, or focus: "Use a blue color theme and highlight the 3 key stats."'
          }
          value={customPrompt}
          onChange={setCustomPrompt}
          studioTool="infographic"
        />
      </StudioCustomizeBody>
      <StudioCustomizeFooter>
        <Button onClick={() => onGenerate({ orientation, visualStyle, detailLevel, customPrompt })}>
          Generate
        </Button>
      </StudioCustomizeFooter>
    </>
  );
}
