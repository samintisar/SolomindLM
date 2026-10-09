import { SPREADSHEET_PRESET_REQUESTS } from "@convex/_agents/spreadsheet/presetRequests";
import type React from "react";
import type { StudioDialogTheme } from "./customize/dialogContext";
import { type PromptFormat, PromptFormatPicker } from "./customize/PromptFormatPicker";
import { StudioCustomizeDialog } from "./customize/StudioCustomizeDialog";

interface CustomizeSpreadsheetsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (config: SpreadsheetConfig) => void;
  /** When true, opens inside a positioned parent (the marketing hero preview) instead of the viewport. */
  embedded?: boolean;
  /** Pins light-theme tokens on always-light pages (the auth page). */
  theme?: StudioDialogTheme;
  /** A marketing mock-up (landing, sign-in): hides Discover Prompts and Save as reusable prompt. */
  preview?: boolean;
}

export interface SpreadsheetConfig {
  spreadsheetType:
    | "data_extraction"
    | "comparison_table"
    | "timeline"
    | "financial_summary"
    | "custom";
  customPrompt: string;
}

const CUSTOM_FORMAT: PromptFormat<SpreadsheetConfig["spreadsheetType"]> = {
  id: "custom",
  title: "Create Your Own",
  description: "Create a custom spreadsheet based on your specific requirements and instructions.",
  prompt: "",
};

// Each built-in format sends its whole-table request; the job runs it with no topic narrowing (#451).
const SPREADSHEET_FORMATS: PromptFormat<SpreadsheetConfig["spreadsheetType"]>[] = [
  CUSTOM_FORMAT,
  {
    id: "data_extraction",
    title: "Data Table",
    description:
      "Extract and organize key data points, facts, and figures from your sources into a structured table.",
    prompt: SPREADSHEET_PRESET_REQUESTS.data_extraction,
  },
  {
    id: "comparison_table",
    title: "Comparison",
    description:
      "Compare and contrast different concepts, products, or ideas across multiple dimensions.",
    prompt: SPREADSHEET_PRESET_REQUESTS.comparison_table,
  },
  {
    id: "timeline",
    title: "Timeline",
    description:
      "Organize events, milestones, or developments in chronological order with key details.",
    prompt: SPREADSHEET_PRESET_REQUESTS.timeline,
  },
  {
    id: "financial_summary",
    title: "Financial",
    description: "Extract and organize financial data, metrics, and figures into a summary table.",
    prompt: SPREADSHEET_PRESET_REQUESTS.financial_summary,
  },
];

export const CustomizeSpreadsheetsModal: React.FC<CustomizeSpreadsheetsModalProps> = ({
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
    <PromptFormatPicker
      kind="spreadsheet"
      title="Create spreadsheet"
      description="Pick a table format, or describe your own."
      studioTool="spreadsheet"
      formats={SPREADSHEET_FORMATS}
      customFormat={CUSTOM_FORMAT}
      onPick={(format) => onGenerate({ spreadsheetType: format.id, customPrompt: format.prompt })}
      onGenerate={(spreadsheetType, customPrompt) => onGenerate({ spreadsheetType, customPrompt })}
      promptLabel="Describe the spreadsheet you want to create"
      promptPlaceholder="Tell SolomindLM how to structure and organize your spreadsheet..."
      generateLabel="Generate Spreadsheet"
      columns={3}
    />
  </StudioCustomizeDialog>
);
