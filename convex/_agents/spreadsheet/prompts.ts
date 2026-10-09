"use node";
/**
 * Prompt templates for SpreadsheetGraph.
 * STRATEGY: Context-First Aggregation (The "NotebookLM" Approach)
 * 1. Map: Identify Concepts & Collect Examples (don't format yet).
 * 2. Collapse: Merge & Deduplicate details about the same concepts.
 * 3. Reduce: Synthesize a high-level table where 1 Row = 1 Concept.
 * Every spreadsheet fills {customPrompt} with a request: the user's own, or a built-in format's
 * (presetRequests.ts).
 */

// ============================================================
// SYSTEM PROMPTS
// ============================================================

export const MAP_SYSTEM_PROMPT =
  "You are a Research Assistant. Analyze the text to identify distinct concepts, methods, or entities. Collect all relevant details and examples for each. Do not format as a table yet.";

export const COLLAPSE_SYSTEM_PROMPT =
  "You are a Technical Editor. Consolidate fragmented research notes into a Master List of Concepts. Merge details about the same concept into single blocks. Remove exact duplicates.";

export const REDUCE_SYSTEM_PROMPT =
  "You are a Data Analyst. Convert the provided Research Briefing into a high-level summary CSV table. Ensure every row represents a unique concept. Follow RFC 4180 CSV standards: enclose all fields in double quotes, escape internal quotes by doubling them, preserve line breaks within quoted fields. Write every cell for someone reading the original sources: when a value is missing, write 'Not reported', and never mention notes, extracts or how the table was made.";

// ============================================================
// MAP PROMPT (Concept Identification)
// ============================================================

export const MAP_PROMPT = `{customPrompt}

GOAL: Extract details based on the user's request, grouping by the main subject.
- Identify the main subjects/entities relevant to the prompt.
- Collect all facts, numbers, and details for each subject.
- Group related facts together.

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
