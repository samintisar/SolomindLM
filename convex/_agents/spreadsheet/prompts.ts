"use node";
/**
 * Prompt templates for SpreadsheetGraph.
 * STRATEGY: Context-First Aggregation (The "NotebookLM" Approach)
 * 1. Map: Note the items the request is about, with their details nested under them (don't format yet).
 * 2. Collapse: Merge & Deduplicate details about the same concepts.
 * 3. Reduce: Synthesize a high-level table where 1 Row = 1 Concept.
 * Every spreadsheet fills {customPrompt} with a request: the user's own, or a built-in format's
 * (presetRequests.ts).
 */

// ============================================================
// SYSTEM PROMPTS
// ============================================================

// Notes keep the source's own hierarchy. Asked for every "distinct concept, method or entity", the map
// model promoted an item's techniques and examples to items of their own, and the reduce then filled
// the table with those sub-points and dropped real items.
export const MAP_SYSTEM_PROMPT =
  "You are a Research Assistant. Take notes on the text for the user's request: identify the items the request is about and collect every relevant detail and example for each. Keep the text's own structure: the parts, steps, techniques and examples of an item are details of that item, not separate items. Do not format as a table yet.";

export const COLLAPSE_SYSTEM_PROMPT =
  "You are a Technical Editor. Consolidate fragmented research notes into a Master List of Concepts. Merge details about the same concept into single blocks. Remove exact duplicates.";

export const REDUCE_SYSTEM_PROMPT =
  "You are a Data Analyst. Convert the provided Research Briefing into a high-level summary table. Ensure every row represents a unique concept. Write the table as JSON lines: the column names as one JSON array of strings on the first line, then each row as one JSON array of strings on its own line. Write every cell for someone reading the original sources: when a value is missing, write 'Not reported' unless the request says how to show missing values, and never mention notes, extracts or how the table was made.";

// ============================================================
// MAP PROMPT (Concept Identification)
// ============================================================

export const MAP_PROMPT = `{customPrompt}

GOAL: Take notes for the request above, organised by the items the request is about.
- Identify the items of the kind the request asks about that this text covers. Use the names the text gives them, and keep the text's own number for an item when it numbers them.
- Under each item, collect all of its facts, numbers, steps, techniques and examples. These stay nested under their item; never list them as items of their own.
- Put anything relevant that belongs to no item under a final "Other details" heading.

Text:
{chunk}

RESEARCH NOTES:`;

// ============================================================
// COLLAPSE PROMPT (Aggregating & Merging)
// ============================================================

export const COLLAPSE_PROMPT = `{customPrompt}

CRITICAL INSTRUCTION: Consolidate these notes.
- Merge facts about the same entity/subject.
- Remove exact duplicates.
- Organize logically for the final table.

Input Notes:
{content}

CONSOLIDATED NOTES:`;

// ============================================================
// ROW PLAN PROMPT (choose the rows before writing the table, #451)
// ============================================================

export const ROW_PLAN_SYSTEM_PROMPT =
  "You are a Data Analyst planning the rows of a table before it is written. Reply with JSON only.";

export const ROW_PLAN_PROMPT = `User Request: "{customPrompt}"

Decide which rows the table for this request should have, using the research notes below.
- A row is one item of the kind the request is about. When the request says what a row is (one per source, per paper, per event), follow it.
- When the sources give those items as a numbered or named list, the rows are that list: every item on it and nothing else.
- The parts, steps, techniques, examples, datasets, tools and cited works of an item are details of that item, not rows. So is anything a source only mentions in passing.
- List each item once, under the name the sources give it, in the order a reader would expect.

Reply with JSON only: {"rows": ["first item", "second item"]}

Research Notes:
{content}`;

// ============================================================
// REDUCE PROMPT (Final Table Synthesis)
// ============================================================

export const REDUCE_PROMPT = `CRITICAL INSTRUCTION:
Create a comprehensive table based on the user's custom request.

User Request: "{customPrompt}"

{rowPlan}

Rules:
1. **Columns:** Auto-detect the best columns to represent the data.
2. **Rows:** One row per distinct item the request is about. Things the sources
   only mention in passing are not items.
3. **Density:** Consolidate details to avoid sparse rows.
4. **Coverage:** If the items the request is about form a discrete, named list
   in the sources (e.g. "the 7 principles", "frameworks: X, Y, Z"), every named
   item MUST appear as its own row. Never drop a named item because its row
   would look similar to another named item's row.
5. **Nested lists stay in cells:** Lists that belong to one item (works it cites,
   studies it includes, examples it gives) go in that item's cells, not in rows
   of their own.
6. **Format (JSON lines):**
   - First line: the column names as a JSON array of strings.
   - Then one line per row: a JSON array of strings, one value per column, in the
     columns' order. Every row has exactly as many values as there are columns;
     use "" for an empty cell.
   - Use JSON string escapes for quotes and line breaks inside a value, so each
     array stays on one line.
   - Example:
     ["Item","Year","Notes"]
     ["First item","2020","Uses \\"quotes\\", commas, anything"]
7. **Output:** The JSON lines only. No markdown blocks, no code fences, no
   wrapping array or object, no other text.

Research Notes:
{content}

FINAL TABLE:`;
