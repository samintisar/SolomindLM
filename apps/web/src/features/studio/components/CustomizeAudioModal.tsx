import type React from "react";
import { useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { FieldLegend, FieldSet } from "@/shared/components/ui/field";
import type { StudioDialogTheme } from "./customize/dialogContext";
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

interface AudioFormat {
  id: string;
  title: string;
  description: string;
}

const FORMATS: AudioFormat[] = [
  {
    id: "deep_dive",
    title: "Deep Dive",
    description:
      "A lively conversation between two hosts, unpacking and connecting topics in your sources",
  },
  {
    id: "brief",
    title: "Brief",
    description: "A bite-sized overview to help you grasp the core ideas from your sources quickly",
  },
  {
    id: "critique",
    title: "Critique",
    description:
      "An expert review of your sources, offering constructive feedback to help you improve your material",
  },
  {
    id: "debate",
    title: "Debate",
    description:
      "A thoughtful debate between two hosts, illuminating different perspectives on your sources",
  },
];

const LENGTH_OPTIONS = [
  { value: "short", label: "Short" },
  { value: "default", label: "Default" },
  { value: "long", label: "Long" },
] as const satisfies readonly ToggleOption<AudioConfig["length"]>[];

const FOCUS_PLACEHOLDER = [
  "Things to try",
  '• Focus on a specific source ("only cover the article about Italy")',
  '• Focus on a specific topic ("just discuss the novel\'s main character")',
  '• Target a specific audience ("explain to someone new to biology")',
].join("\n");

interface CustomizeAudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (config: AudioConfig) => void;
  /** When true, opens inside a positioned parent (a preview mock-up) instead of the viewport. */
  embedded?: boolean;
  /** Pins light-theme tokens on always-light pages (the auth page). */
  theme?: StudioDialogTheme;
  /** A marketing mock-up (landing, sign-in): hides Discover Prompts and Save as reusable prompt. */
  preview?: boolean;
}

export interface AudioConfig {
  formatId: string;
  length: "short" | "default" | "long";
  focus: string;
}

export const CustomizeAudioModal: React.FC<CustomizeAudioModalProps> = ({
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
    <AudioForm onGenerate={onGenerate} />
  </StudioCustomizeDialog>
);

// Inside DialogContent, which unmounts on close: every open starts from the defaults.
function AudioForm({ onGenerate }: { onGenerate: (config: AudioConfig) => void }) {
  const [formatId, setFormatId] = useState("deep_dive");
  const [length, setLength] = useState<AudioConfig["length"]>("default");
  const [focus, setFocus] = useState("");
  return (
    <>
      <StudioCustomizeHeader
        kind="audio"
        title="Customize Audio Overview"
        description="Pick a format and a length, and tell the hosts what to focus on."
        promptLibrary={{ studioTool: "audio", onApplyPrompt: setFocus }}
      />
      <StudioCustomizeBody>
        <FieldSet>
          <FieldLegend variant="label">Format</FieldLegend>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {FORMATS.map((format) => (
              <OptionCard
                key={format.id}
                title={format.title}
                description={format.description}
                selected={formatId === format.id}
                onSelect={() => setFormatId(format.id)}
              />
            ))}
          </div>
        </FieldSet>
        <OptionToggleGroup
          label="Length"
          value={length}
          options={LENGTH_OPTIONS}
          onValueChange={setLength}
        />
        <PromptField
          label="What should the AI hosts focus on in this episode?"
          placeholder={FOCUS_PLACEHOLDER}
          value={focus}
          onChange={setFocus}
          studioTool="audio"
        />
      </StudioCustomizeBody>
      <StudioCustomizeFooter>
        <Button onClick={() => onGenerate({ formatId, length, focus })}>Generate Audio</Button>
      </StudioCustomizeFooter>
    </>
  );
}
