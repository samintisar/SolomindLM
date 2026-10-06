import type React from "react";
import type { StudioDialogTheme } from "./customize/dialogTheme";
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

// Helper function to clean backend prompts for UI display
// Removes "Text:\n{chunk}\n\n" and final labels like "CONCEPT EXTRACTION:"
function cleanPromptForDisplay(prompt: string): string {
  return prompt
    .replace(/\nText:\s*\n\{chunk\}\s*\n\n/g, "") // Remove "Text:\n{chunk}\n\n"
    .replace(/\n\{chunk\}\s*\n\n/g, "") // Also handle case without "Text:"
    .replace(
      /\n(CONCEPT EXTRACTION|ITEM DETAILS|EVENT LOG|FINANCIAL NOTES|RESEARCH NOTES):\s*$/g,
      ""
    ) // Remove final labels
    .trim();
}

const CUSTOM_FORMAT: PromptFormat<SpreadsheetConfig["spreadsheetType"]> = {
  id: "custom",
  title: "Create Your Own",
  description: "Create a custom spreadsheet based on your specific requirements and instructions.",
  prompt: "",
};

const SPREADSHEET_FORMATS: PromptFormat<SpreadsheetConfig["spreadsheetType"]>[] = [
  CUSTOM_FORMAT,
  {
    id: "data_extraction",
    title: "Data Table",
    description:
      "Extract and organize key data points, facts, and figures from your sources into a structured table.",
    prompt:
      cleanPromptForDisplay(`Analyze this text and identify the distinct **Concepts** or **Methods** discussed.

GOAL: Summarize the *types* of things found, not every single instance.
- Identify the distinct concepts (e.g., specific Methods, Theories, or Approaches).
- For each concept, extract its general definition and key characteristics.
- If multiple specific examples or datasets are mentioned for one concept, **list them together** under that concept name. 
- Do not create separate entries for every example; group them by the concept they illustrate.

Text:
{chunk}

CONCEPT EXTRACTION:`),
  },
  {
    id: "comparison_table",
    title: "Comparison",
    description:
      "Compare and contrast different concepts, products, or ideas across multiple dimensions.",
    prompt:
      cleanPromptForDisplay(`Analyze this text to identify the specific **Items** or **Products** being compared.

GOAL: Group details by Item/Product.
- Identify the unique items being discussed.
- Under each item, list every feature, spec, pro, and con mentioned.
- If a specific metric is mentioned, record the exact number.

Text:
{chunk}

ITEM DETAILS:`),
  },
  {
    id: "timeline",
    title: "Timeline",
    description:
      "Organize events, milestones, or developments in chronological order with key details.",
    prompt:
      cleanPromptForDisplay(`Analyze this text to identify distinct **Time Periods** or **Major Events**.

GOAL: Extract a chronological flow.
- Identify specific dates or time periods.
- For each date, describe the main event.
- If multiple minor details relate to one main event, group them under that event.

Text:
{chunk}

EVENT LOG:`),
  },
  {
    id: "financial_summary",
    title: "Financial",
    description: "Extract and organize financial data, metrics, and figures into a summary table.",
    prompt:
      cleanPromptForDisplay(`Analyze this text to identify distinct **Financial Categories** or **Accounts**.

GOAL: Group figures by Category.
- Identify categories (e.g., broad revenue streams or expense types).
- List the specific amounts and dates associated with each category.
- Keep the raw numbers accurate.

Text:
{chunk}

FINANCIAL NOTES:`),
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
