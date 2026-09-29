import type { DialogueLine } from "./state";

export type DialogueScriptParseResult =
  | { ok: true; script: DialogueLine[] }
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
function salvageDialogueLines(responseText: string, startIndex: number): DialogueLine[] {
  const lines: DialogueLine[] = [];
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
    }
  }

  return lines;
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
  if (salvaged.length >= minimumLines) {
    return { ok: true, script: salvaged };
  }

  return strict;
}

export type GenerateValidatedDialogueScriptOptions = {
  /** Produces the raw model response for a 1-based attempt number. Errors propagate unchanged. */
  generate: (attempt: number) => Promise<string>;
  minimumLines: number;
  maxAttempts: number;
  /** Return false to stop retrying after a parse failure (e.g. time budget exhausted). */
  canRetry?: () => boolean;
  onAttemptFailed?: (info: { attempt: number; reason: string; responseText: string }) => void;
};

/**
 * Calls `generate` until its response parses into a valid dialogue script. Throws (rather than
 * returning placeholder content) when no attempt produces one.
 */
export async function generateValidatedDialogueScript(
  options: GenerateValidatedDialogueScriptOptions
): Promise<{ script: DialogueLine[]; attempt: number }> {
  const { generate, minimumLines, maxAttempts, canRetry, onAttemptFailed } = options;
  let lastReason = "no usable script was produced";
  let attemptsMade = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    attemptsMade = attempt;
    const responseText = await generate(attempt);
    const parseResult = parseDialogueScriptResponse(responseText, minimumLines);

    if (parseResult.ok) return { script: parseResult.script, attempt };

    lastReason = describeDialogueScriptParseFailure(parseResult);
    onAttemptFailed?.({ attempt, reason: lastReason, responseText });

    if (canRetry && !canRetry()) break;
  }

  throw new Error(
    `Dialogue script generation failed after ${attemptsMade} attempt(s): ${lastReason}`
  );
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
