/**
 * The built-in spreadsheet formats, each written as the request for the whole table. The Create
 * spreadsheet dialog shows and sends these, and the job runs them through the same map, collapse
 * and reduce prompts as a user's own request. A chunk-level instruction ("identify the items
 * discussed in this text") sent here made a row of every entity the sources mention (#451).
 *
 * No double quotes: the reduce prompt wraps the request in them.
 */
export const SPREADSHEET_PRESET_REQUESTS = {
  data_extraction: `Build one table of the distinct concepts, methods or approaches the selected sources describe, one row per concept, not one per instance.
Use columns for each concept's definition, key characteristics and where it applies. Several examples, datasets or cases of the same concept go together in that concept's row, never in rows of their own.`,

  comparison_table: `Build one comparison table from all the selected sources together, one row per item compared. Choose the rows from all the sources, in this order:
1. If there are several sources and each is mainly about a different subject (a paper's method, a product, a company, a policy), the rows are those subjects, one per source. What a source compares its subject against goes in that row's cells.
2. Otherwise, the rows are the options the sources weigh against each other (the approaches a paper tests, the products a buyer's guide reviews). A source about one of those options adds to that option's row; a source about a further option gets a row of its own.
3. If the sources weigh no options against each other (for example, several notes on one topic), make one row per source showing what each says.
Examples a source walks through, the datasets and tools it uses and the works it cites go in the cells of the item they belong to, never in rows of their own.
Use columns for the features, specs, metrics (with exact numbers), strengths and weaknesses a reader would weigh when choosing between the items.`,

  timeline: `Build one timeline of the events and periods across all the selected sources, oldest first, one row per event.
Use columns for the date or period, the event, a description and its significance. Minor details of the same event go in that event's row, never in rows of their own.`,

  financial_summary: `Build one table of the financial figures across all the selected sources, grouped by category (for example a revenue stream or an expense type), one row per distinct figure.
Use columns for the category, item, amount, date and type, and keep every amount exactly as the sources give it.`,
} as const;

type SpreadsheetPresetType = keyof typeof SPREADSHEET_PRESET_REQUESTS;

/**
 * The request a spreadsheet job runs, and the topic to narrow its sources to (#288). An unedited
 * preset, or a preset started with no prompt, runs the preset's request and keeps every source:
 * it names no topic, and its wording would skew the narrowing. Anything the user wrote, including
 * an edited preset, is the request and the topic.
 */
export function resolveSpreadsheetRequest(
  spreadsheetType: string,
  customPrompt: string | undefined
): { request: string; topic: string | undefined } {
  const written = customPrompt?.trim() ?? "";
  const preset: string | undefined =
    SPREADSHEET_PRESET_REQUESTS[spreadsheetType as SpreadsheetPresetType];
  if (preset && (written === "" || written === preset)) {
    return { request: preset, topic: undefined };
  }
  return { request: written, topic: written || undefined };
}
