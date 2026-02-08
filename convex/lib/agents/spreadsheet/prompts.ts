"use node"
/**
 * Prompt templates for SpreadsheetGraph.
 * STRATEGY: Context-First Aggregation (The "NotebookLM" Approach)
 * 1. Map: Identify Concepts & Collect Examples (don't format yet).
 * 2. Collapse: Merge & Deduplicate details about the same concepts.
 * 3. Reduce: Synthesize a high-level table where 1 Row = 1 Concept.
 */

// ============================================================
// SYSTEM PROMPTS
// ============================================================

export const MAP_SYSTEM_PROMPT = 'You are a Research Assistant. Analyze the text to identify distinct concepts, methods, or entities. Collect all relevant details and examples for each. Do not format as a table yet.';

export const COLLAPSE_SYSTEM_PROMPT = 'You are a Technical Editor. Consolidate fragmented research notes into a Master List of Concepts. Merge details about the same concept into single blocks. Remove exact duplicates.';

export const REDUCE_SYSTEM_PROMPT = 'You are a Data Analyst. Convert the provided Research Briefing into a high-level summary CSV table. Ensure every row represents a unique concept. Follow RFC 4180 CSV standards: enclose all fields in double quotes, escape internal quotes by doubling them, preserve line breaks within quoted fields.';

// ============================================================
// MAP PROMPTS (Concept Identification)
// ============================================================

export const MAP_PROMPTS: Record<string, string> = {
  data_extraction: `Analyze this text and identify the distinct **Concepts** or **Methods** discussed.

GOAL: Summarize the *types* of things found, not every single instance.
- Identify the distinct concepts (e.g., specific Methods, Theories, or Approaches).
- For each concept, extract its general definition and key characteristics.
- If multiple specific examples or datasets are mentioned for one concept, **list them together** under that concept name. 
- Do not create separate entries for every example; group them by the concept they illustrate.

Text:
{chunk}

CONCEPT EXTRACTION:`,

  comparison_table: `Analyze this text to identify the specific **Items** or **Products** being compared.

GOAL: Group details by Item/Product.
- Identify the unique items being discussed.
- Under each item, list every feature, spec, pro, and con mentioned.
- If a specific metric is mentioned, record the exact number.

Text:
{chunk}

ITEM DETAILS:`,

  timeline: `Analyze this text to identify distinct **Time Periods** or **Major Events**.

GOAL: Extract a chronological flow.
- Identify specific dates or time periods.
- For each date, describe the main event.
- If multiple minor details relate to one main event, group them under that event.

Text:
{chunk}

EVENT LOG:`,

  financial_summary: `Analyze this text to identify distinct **Financial Categories** or **Accounts**.

GOAL: Group figures by Category.
- Identify categories (e.g., broad revenue streams or expense types).
- List the specific amounts and dates associated with each category.
- Keep the raw numbers accurate.

Text:
{chunk}

FINANCIAL NOTES:`,

  custom: `{customPrompt}

GOAL: Extract details based on the user's request, grouping by the main subject.
- Identify the main subjects/entities relevant to the prompt.
- Collect all facts, numbers, and details for each subject.
- Group related facts together.

Text:
{chunk}

RESEARCH NOTES:`,
};

// ============================================================
// COLLAPSE PROMPTS (Aggregating & Merging)
// ============================================================

export const COLLAPSE_PROMPTS: Record<string, string> = {
  data_extraction: `You are a Technical Editor.
Consolidate these research notes into a "Master List of Concepts."

CRITICAL INSTRUCTION: **Group by Concept Name.**
- If multiple notes mention the same Concept (e.g., "Method A") but with different examples or contexts, **MERGE** them into a single block about "Method A".
- Combine the lists of examples into a single summary line (e.g., "Examples found: Context 1, Context 2").
- Do NOT output separate blocks for the same concept.

Input Notes:
{content}

CONSOLIDATED CONCEPT BRIEFING:`,

  comparison_table: `You are a Product Analyst.
Consolidate these notes into a structured comparison briefing.

CRITICAL INSTRUCTION: **Group by Item Name.**
- Merge all notes about "Item A" into one comprehensive block.
- Merge all notes about "Item B" into one comprehensive block.
- Conflicting data? Note both values.
- Remove duplicate observations.

Input Notes:
{content}

CONSOLIDATED COMPARISON NOTES:`,

  timeline: `You are a Historian.
Consolidate these event notes into a single chronological sequence.

CRITICAL INSTRUCTION: **Sort by Date.**
- Merge descriptions for the exact same date/event.
- Ensure the flow is strictly chronological (oldest to newest).

Input Notes:
{content}

MASTER TIMELINE:`,

  financial_summary: `You are a Financial Auditor.
Consolidate these financial extracts.

CRITICAL INSTRUCTION: **Group by Category.**
- Keep specific line items visible (do not sum them up yet unless they are duplicates).
- Ensure similar items are grouped together under their main Category.

Input Notes:
{content}

FINANCIAL BRIEFING:`,

  custom: `{customPrompt}

CRITICAL INSTRUCTION: Consolidate these notes.
- Merge facts about the same entity/subject.
- Remove exact duplicates.
- Organize logically for the final table.

Input Notes:
{content}

CONSOLIDATED NOTES:`,
};

// ============================================================
// REDUCE PROMPTS (Final Table Synthesis)
// ============================================================

export const REDUCE_PROMPTS: Record<string, string> = {
  data_extraction: `CRITICAL INSTRUCTION:
Create a high-level Summary Table where **Each Row = One Unique Concept**.

Context:
The user wants a clean, textbook-style overview table.

Rules:
1. **One Row Per Concept:** (e.g., One row per Method/Theory). Never create multiple rows for the same concept just because there are different examples.
2. **Consolidate Examples:** In the "Application/Context" column, list *all* the different scenarios found for that concept.
3. **Generalize Columns:** Use columns that apply to the *concept* (e.g., "Definition", "Key Assumptions", "Key Metrics", "Typical Use Case").
4. **CSV Formatting (RFC 4180):**
   - Enclose EVERY field in double quotes ("field")
   - If a field contains double quotes, escape them by doubling ("")
   - Preserve line breaks and special characters inside quoted fields
   - Example: "Field with, comma","Field with ""quotes""","Field with
   line break"
5. **Output:** Raw CSV only. No markdown blocks, no code fences.

Research Notes:
{content}

FINAL SUMMARY TABLE:`,

  comparison_table: `CRITICAL INSTRUCTION:
Create a Master Comparison Table where **Each Row = One Unique Item**.

Rules:
1. **One Row Per Item:** Each distinct product or item gets exactly one row.
2. **Columns = Features:** Create columns for every major feature/spec found.
3. **Fill Gaps:** If a feature is missing for an item, leave it blank or write "N/A".
4. **CSV Formatting (RFC 4180):**
   - Enclose EVERY field in double quotes ("field")
   - If a field contains double quotes, escape them by doubling ("")
   - Preserve line breaks and special characters inside quoted fields
   - Example: "Field with, comma","Field with ""quotes""","Field with
   line break"
5. **Output:** Raw CSV only. No markdown blocks, no code fences.

Research Notes:
{content}

FINAL COMPARISON TABLE:`,

  timeline: `CRITICAL INSTRUCTION:
Create a Master Timeline Table.

Rules:
1. **Sort Chronologically:** Oldest dates at the top.
2. **Columns:** Date, Event Name, Description, Significance/Impact.
3. **One Row Per Event:** Do not split single events into multiple rows.
4. **CSV Formatting (RFC 4180):**
   - Enclose EVERY field in double quotes ("field")
   - If a field contains double quotes, escape them by doubling ("")
   - Preserve line breaks and special characters inside quoted fields
   - Example: "Field with, comma","Field with ""quotes""","Field with
   line break"
5. **Output:** Raw CSV only. No markdown blocks, no code fences.

Research Notes:
{content}

FINAL TIMELINE TABLE:`,

  financial_summary: `CRITICAL INSTRUCTION:
Create a Master Financial Table.

Rules:
1. **Columns:** Category, Item Description, Amount, Date, Type.
2. **Rows:** List every distinct transaction or financial figure found.
3. **Format:** Ensure amounts are consistently formatted.
4. **CSV Formatting (RFC 4180):**
   - Enclose EVERY field in double quotes ("field")
   - If a field contains double quotes, escape them by doubling ("")
   - Preserve line breaks and special characters inside quoted fields
   - Example: "Field with, comma","Field with ""quotes""","Field with
   line break"
5. **Output:** Raw CSV only. No markdown blocks, no code fences.

Research Notes:
{content}

FINAL FINANCIAL TABLE:`,

  custom: `CRITICAL INSTRUCTION:
Create a comprehensive table based on the user's custom request.

User Request: "{customPrompt}"

Rules:
1. **Columns:** Auto-detect the best columns to represent the data.
2. **Rows:** One row per distinct entity/subject.
3. **Density:** Consolidate details to avoid sparse rows.
4. **CSV Formatting (RFC 4180):**
   - Enclose EVERY field in double quotes ("field")
   - If a field contains double quotes, escape them by doubling ("")
   - Preserve line breaks and special characters inside quoted fields
   - Example: "Field with, comma","Field with ""quotes""","Field with
   line break"
5. **Output:** Raw CSV only. No markdown blocks, no code fences.

Research Notes:
{content}

FINAL TABLE:`,
};