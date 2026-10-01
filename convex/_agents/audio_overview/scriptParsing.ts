import { EmptyLlmResponseError } from "../_shared/llmErrors";
import type { DialogueLine } from "./state";

export type DialogueScriptParseResult =
  /**
   * `salvaged`: the array was cut off or malformed and only its complete lines were kept.
   * `truncated`: salvaged because the array was never closed (output cut off), so no real ending.
   */
  | { ok: true; script: DialogueLine[]; salvaged: boolean; truncated: boolean }
  | { ok: false; reason: "missing_json_array" }
  | { ok: false; reason: "invalid_json"; message: string }
  | { ok: false; reason: "not_array" }
  | { ok: false; reason: "invalid_line"; lineIndex: number }
  | { ok: false; reason: "too_short"; actualLines: number; minimumLines: number };

function isDialogueLine(value: unknown): value is DialogueLine {
  if (!value || typeof value !== "object") return false;

  const candidate = value as { speaker?: unknown; text?: unknown };
  return (
    (candidate.speaker === "host_a" || candidate.speaker === "host_b") &&
    typeof candidate.text === "string" &&
    candidate.text.trim().length > 0
  );
}

export function getMinimumDialogueLines(targetLines: number): number {
  return Math.min(12, Math.max(8, Math.ceil(targetLines * 0.25)));
}

/**
 * Walks the response from `startIndex` and collects every complete top-level `{...}` object that
 * is a valid dialogue line. Tolerates truncated output (an unfinished trailing object is
 * dropped) and isolated malformed entries, which a strict `JSON.parse` would reject wholesale.
 */
function salvageDialogueLines(
  responseText: string,
  startIndex: number
): { lines: DialogueLine[]; closed: boolean } {
  const lines: DialogueLine[] = [];
  let closed = false;
  let depth = 0;
  let objectStart = -1;
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < responseText.length; index += 1) {
    const char = responseText[index];

    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === "{") {
      if (depth === 0) objectStart = index;
      depth += 1;
    } else if (char === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && objectStart !== -1) {
        try {
          const candidate: unknown = JSON.parse(responseText.substring(objectStart, index + 1));
          if (isDialogueLine(candidate)) {
            lines.push({ speaker: candidate.speaker, text: candidate.text.trim() });
          }
        } catch {
          // Skip the malformed object and keep scanning.
        }
        objectStart = -1;
      }
    } else if (char === "]" && depth === 0) {
      closed = true;
      break;
    }
  }

  return { lines, closed };
}

function parseStrictDialogueScript(
  responseText: string,
  jsonStart: number,
  minimumLines: number
): DialogueScriptParseResult {
  const jsonEnd = responseText.lastIndexOf("]");

  if (jsonStart === -1 || jsonEnd === -1 || jsonEnd < jsonStart) {
    return { ok: false, reason: "missing_json_array" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(responseText.substring(jsonStart, jsonEnd + 1));
  } catch (error) {
    return {
      ok: false,
      reason: "invalid_json",
      message: error instanceof Error ? error.message : String(error),
    };
  }

  if (!Array.isArray(parsed)) {
    return { ok: false, reason: "not_array" };
  }

  for (let index = 0; index < parsed.length; index += 1) {
    if (!isDialogueLine(parsed[index])) {
      return { ok: false, reason: "invalid_line", lineIndex: index };
    }
  }

  if (parsed.length < minimumLines) {
    return {
      ok: false,
      reason: "too_short",
      actualLines: parsed.length,
      minimumLines,
    };
  }

  return {
    ok: true,
    script: parsed.map((line) => ({
      speaker: line.speaker,
      text: line.text.trim(),
    })),
    salvaged: false,
    truncated: false,
  };
}

export function parseDialogueScriptResponse(
  responseText: string,
  minimumLines: number
): DialogueScriptParseResult {
  const jsonStart = responseText.indexOf("[");
  const strict = parseStrictDialogueScript(responseText, jsonStart, minimumLines);

  if (strict.ok || jsonStart === -1) return strict;
  if (strict.reason === "not_array" || strict.reason === "too_short") return strict;

  // Truncated output or a few malformed entries: keep the valid lines if there are enough.
  const salvaged = salvageDialogueLines(responseText, jsonStart);
  if (salvaged.lines.length >= minimumLines) {
    return { ok: true, script: salvaged.lines, salvaged: true, truncated: !salvaged.closed };
  }

  return strict;
}

/** Why the previous attempt failed, so a retry can tailor its instructions. */
export type DialogueScriptFailureKind = "empty_response" | "invalid_script";

export type GenerateValidatedDialogueScriptOptions = {
  /**
   * Produces the raw model response for a 1-based attempt number; `previousFailure` is set on
   * retries. An `EmptyLlmResponseError` counts as a failed attempt; any other error propagates
   * unchanged.
   */
  generate: (attempt: number, previousFailure?: DialogueScriptFailureKind) => Promise<string>;
  minimumLines: number;
  maxAttempts: number;
  /** Return false to stop retrying after a failed attempt (e.g. time budget exhausted). */
  canRetry?: () => boolean;
  onAttemptFailed?: (info: { attempt: number; reason: string; responseText: string }) => void;
};

/**
 * Calls `generate` until its response parses into a valid dialogue script. Throws (rather than
 * returning placeholder content) when no attempt produces one.
 */
export async function generateValidatedDialogueScript(
  options: GenerateValidatedDialogueScriptOptions
): Promise<{ script: DialogueLine[]; attempt: number; truncated: boolean }> {
  const { generate, minimumLines, maxAttempts, canRetry, onAttemptFailed } = options;
  let lastReason = "no usable script was produced";
  let lastFailure: DialogueScriptFailureKind | undefined;
  let attemptsMade = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    attemptsMade = attempt;
    let responseText = "";
    try {
      responseText = await generate(attempt, lastFailure);
      const parseResult = parseDialogueScriptResponse(responseText, minimumLines);
      if (parseResult.ok) {
        return { script: parseResult.script, attempt, truncated: parseResult.truncated };
      }
      lastFailure = "invalid_script";
      lastReason = describeDialogueScriptParseFailure(parseResult);
    } catch (error) {
      // An empty completion is a bad sample, not an outage: retry like a parse failure.
      if (!(error instanceof EmptyLlmResponseError)) throw error;
      lastFailure = "empty_response";
      lastReason = `The model returned an empty response (finish_reason=${error.finishReason ?? "unknown"}).`;
    }

    onAttemptFailed?.({ attempt, reason: lastReason, responseText });
    if (canRetry && !canRetry()) break;
  }

  throw new Error(
    `Dialogue script generation failed after ${attemptsMade} attempt(s): ${lastReason}`
  );
}

/** Chinese and Japanese are written without spaces between words. */
const UNSPACED_SCRIPT_CHARS = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu;
/** Rough characters per word for unspaced scripts, so word targets mean the same spoken length. */
const CHARS_PER_UNSPACED_WORD = 2;

/** Counts words in dialogue text, including languages that don't separate words with spaces. */
export function countDialogueWords(text: string): number {
  const unspacedChars = text.match(UNSPACED_SCRIPT_CHARS)?.length ?? 0;
  const spacedWords = text.replace(UNSPACED_SCRIPT_CHARS, " ").split(/\s+/).filter(Boolean).length;
  return spacedWords + Math.ceil(unspacedChars / CHARS_PER_UNSPACED_WORD);
}

/** Lines shorter than this (in words) are reactions ("Right.", "Exactly.") that may recur. */
const MIN_WORDS_FOR_REPEAT_CHECK = 6;

function normalizeLineForRepeatCheck(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Drops substantive lines that repeat an earlier line. Long generations can fall into a
 * degenerate loop, restating whole stretches of dialogue verbatim; the repeats add minutes of
 * duplicated audio without new content.
 *
 * `endedInRepeat` is true when the script's last substantive line was a repeat: the loop ran to
 * the end of the output, so the script has no real ending.
 */
export function removeRepeatedDialogueLines(script: DialogueLine[]): {
  script: DialogueLine[];
  removed: number;
  endedInRepeat: boolean;
} {
  const seen = new Set<string>();
  const kept: DialogueLine[] = [];
  let endedInRepeat = false;
  for (const line of script) {
    const normalized = normalizeLineForRepeatCheck(line.text);
    if (countDialogueWords(normalized) >= MIN_WORDS_FOR_REPEAT_CHECK) {
      endedInRepeat = seen.has(normalized);
      if (endedInRepeat) continue;
      seen.add(normalized);
    }
    kept.push(line);
  }
  return { script: kept, removed: script.length - kept.length, endedInRepeat };
}

export function describeDialogueScriptParseFailure(
  result: Exclude<DialogueScriptParseResult, { ok: true }>
): string {
  switch (result.reason) {
    case "missing_json_array":
      return "No JSON array was found in the script response.";
    case "invalid_json":
      return `The script response contained invalid JSON: ${result.message}`;
    case "not_array":
      return "The script response was valid JSON but not a JSON array.";
    case "invalid_line":
      return `The script response contained an invalid dialogue line at index ${result.lineIndex}.`;
    case "too_short":
      return `The script response was too short (${result.actualLines} lines; minimum ${result.minimumLines}).`;
  }
}
