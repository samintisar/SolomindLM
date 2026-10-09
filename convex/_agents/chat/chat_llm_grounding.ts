import { MARKDOWN_MATH_RULES_BULLETS } from "../_shared/markdownMathPrompt.js";
import { passageTextForModel } from "./passageContext.js";
import type { ReferenceChunk } from "./types";

/**
 * Builds grounding prompt optimized for research/learning contexts.
 * Enhanced with chunk metadata for better context awareness.
 */
export function buildGroundingPrompt(
  chunks: ReferenceChunk[],
  userMessage: string,
  conversationHistory: Array<{ role: string; content: string }>
): string {
  const formattedChunks = chunks
    .map((chunk, index) => {
      const meta = chunk.metadata;
      const docType = inferDocumentType(chunk.sourceTitle);
      const typeLabel = docType ? ` (${docType})` : "";

      const sourceLabel = chunk.sourceUrl?.startsWith("http") ? "[Web] " : "";
      let contextHeader = `${sourceLabel}[${index + 1}] From "${chunk.sourceTitle}"${typeLabel}`;

      if (meta?.headingPath && meta.headingPath.length > 0) {
        contextHeader += ` > ${meta.headingPath.join(" > ")}`;
      } else if (meta?.sectionTitle) {
        contextHeader += ` > ${meta.sectionTitle}`;
      }

      const positionInfo: string[] = [];
      if (meta?.pageNumber !== undefined && meta.pageNumber !== null) {
        positionInfo.push(`Page ${meta.pageNumber}`);
      }
      if (meta?.relativePosition !== undefined) {
        const position =
          meta.relativePosition < 0.33
            ? "Beginning"
            : meta.relativePosition < 0.67
              ? "Middle"
              : "End";
        positionInfo.push(`${position} of document`);
      }
      if (positionInfo.length > 0) {
        contextHeader += ` (${positionInfo.join(", ")})`;
      }

      const characteristics: string[] = [];
      if (meta?.hasCodeBlock) characteristics.push("Contains code");
      if (meta?.hasMathNotation) characteristics.push("Contains formulas");
      if (meta?.hasTable) characteristics.push("Contains table");
      if (characteristics.length > 0) {
        contextHeader += `\n[${characteristics.join(", ")}]`;
      }

      const sanitizedContent = chunk.content.replace(/\[\d+\]/g, "");
      const formatted = `${contextHeader}:\n${passageTextForModel(chunk)}`;

      console.log(`[ChatLLMWrapper] Chunk [${index + 1}] (db chunkIndex=${chunk.chunkIndex}):`, {
        sourceTitle: chunk.sourceTitle,
        sectionTitle: meta?.sectionTitle,
        headingPath: meta?.headingPath,
        relativePosition: meta?.relativePosition,
        contentPreview: sanitizedContent.slice(0, 200),
      });

      return formatted;
    })
    .join("\n\n---\n\n");

  let contextSection = "";
  if (conversationHistory.length > 0) {
    const formattedHistory = conversationHistory
      .map((msg) => {
        const role = msg.role === "user" ? "USER" : "ASSISTANT";
        const truncatedContent =
          msg.content.length > 500 ? msg.content.slice(0, 500) + "..." : msg.content;
        return `${role}: ${truncatedContent}`;
      })
      .join("\n");
    contextSection = `# CONVERSATION HISTORY\n${formattedHistory}\n\n`;
  }

  const structureHint = getStructureHint(userMessage);

  const citationReminder = `# CITATION FORMAT (MANDATORY)
- Place [1], [2] DIRECTLY AFTER each fact within sentences (plain brackets only — not \\[1\\])
- Example: "uv is a Python package [1] designed for speed [2]."
- DO NOT add "Sources:" or "References:" at the end
- Every factual claim needs its inline citation

# MATH FORMAT (MANDATORY WHEN USING EQUATIONS)
${MARKDOWN_MATH_RULES_BULLETS}
- Example (inline): "The level $L_t$ evolves as $L_t = \\alpha y_t + (1-\\alpha) L_{t-1}$ [1]."
- Example (display): $$L_t = \\alpha y_t + (1-\\alpha) L_{t-1}$$
- Never write L_t, B_{t-1}, \\eta, or neta without delimiters — they will not render.

# RESPONSE FORMATTING (MANDATORY)
- Use **bold** for key terms when introducing concepts
- Use ### headers for major sections in comparison/explanation responses
- Use markdown tables for side-by-side comparisons when appropriate
- Use numbered lists for sequential steps or ordered items
- Use bullet points for unordered lists of features/properties

`;

  return `# SOURCE DOCUMENTS
${formattedChunks}

${contextSection}${citationReminder}# CURRENT QUESTION
${userMessage}

${structureHint}`;
}

/**
 * Whole-word comparison intent. Bare substrings misfire on "differential",
 * "contrastive" and the like.
 */
const COMPARISON_PATTERN =
  /\b(compare[sd]?|comparing|comparison|contrast(s|ed|ing)?|differ(s|ed|ing)?|differences?|vs\.?|versus)(?=\W|$)/;

/**
 * Provides ultra-concise structure hint based on query type.
 * Includes negative constraints for better adherence.
 */
export function getStructureHint(query: string): string {
  const lower = query.toLowerCase();

  if (COMPARISON_PATTERN.test(lower)) {
    return `Hint: This is a comparison. Shape the answer around exactly what was asked: answer it directly first, then compare the items on the points the question names and the aspects the sources discuss.
If the question asks for specific details (figures, results, conditions), give them prominently.
Use a table only when several items share the same attributes.
Do not add sections the question did not ask for, such as definitions, use cases or relationships.`;
  }

  if (/\b(equations?|formulas?|math|latex|notation|subscripts?|superscripts?)\b/.test(lower)) {
    return (
      "Hint: Use $...$ for inline and $$...$$ for full display equations; never put $ inside $$; " +
      "do not nest dollar math (e.g. avoid \\cmd($x$)); wrap every symbolic variable in delimiters (write $x$, not bare x)."
    );
  }

  if (/^(how|why|explain)\b/.test(lower)) {
    return "Hint: Definition → mechanism/process → examples (if available in sources). Do not provide generic examples not in sources.";
  }

  if (/\b(summari[sz](e|es|ed|ing)|overview|main points|key takeaways)\b/.test(lower)) {
    return "Hint: Main themes → key findings → gaps or questions.";
  }

  if (/^discuss\b|\b(describe|overview of|types of|kinds of|what are)\b/.test(lower)) {
    return "Hint: Cover ALL major aspects mentioned in the sources. Use sections or lists for clarity. Check that you have not skipped important topics present in the documents.";
  }

  if (/\b(list|enumerate)\b/.test(lower)) {
    return "Hint: Use numbered or bulleted lists for clarity. Include citations after each item.";
  }

  return "";
}

/**
 * Checks if query is complex and needs few-shot examples.
 */
export function isComplexQuery(query: string): boolean {
  const complexPatterns = ["compare", "contrast", "explain how", "why does", "difference between"];
  const lower = query.toLowerCase();
  return complexPatterns.some((pattern) => lower.includes(pattern));
}

/**
 * Infers document type from title for better context.
 */
export function inferDocumentType(title: string): string | null {
  const lower = title.toLowerCase();

  if (lower.includes("chapter") || lower.includes("textbook")) return "Textbook";
  if (lower.includes("lecture")) return "Lecture";
  if (lower.includes("paper") || lower.includes("journal")) return "Paper";
  if (lower.includes("notes")) return "Notes";
  if (lower.includes("infographic")) return "Infographics";

  return null;
}

/**
 * Estimates token count (rough approximation: 1 token ≈ 4 characters).
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
