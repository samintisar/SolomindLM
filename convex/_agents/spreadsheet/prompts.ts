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
  "You are a Data Analyst. Convert the provided Research Briefing into a high-level summary CSV table. Ensure every row represents a unique concept. Follow RFC 4180 CSV standards: enclose all fields in double quotes, escape internal quotes by doubling them, preserve line breaks within quoted fields. Write every cell for someone reading the original sources: when a value is missing, write 'Not reported', and never mention notes, extracts or how the table was made.";

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
// REDUCE PROMPT (Final Table Synthesis)
// ============================================================

export const REDUCE_PROMPT = `CRITICAL INSTRUCTION:
Create a comprehensive table based on the user's custom request.

User Request: "{customPrompt}"

Rules:
1. **Columns:** Auto-detect the best columns to represent the data.
2. **Rows:** One row per distinct item the request is about.
3. **Density:** Consolidate details to avoid sparse rows.
4. **Coverage:** If the items the request is about form a discrete, named list
   in the sources (e.g. "the 7 principles", "frameworks: X, Y, Z"), every named
   item MUST appear as its own row. Never drop a named item because its row
   would look similar to another named item's row.
5. **Nested lists stay in cells:** Lists that belong to one item (works it cites,
   studies it includes, examples it gives) go in that item's cells, not in rows
   of their own.
6. **CSV Formatting (RFC 4180):**
   - Enclose EVERY field in double quotes ("field")
   - If a field contains double quotes, escape them by doubling ("")
   - Preserve line breaks and special characters inside quoted fields
   - Example: "Field with, comma","Field with ""quotes""","Field with
   line break"
7. **Output:** Raw CSV only. No markdown blocks, no code fences.

Research Notes:
{content}

FINAL TABLE:`;
