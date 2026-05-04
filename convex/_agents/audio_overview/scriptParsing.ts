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

export function parseDialogueScriptResponse(
  responseText: string,
  minimumLines: number
): DialogueScriptParseResult {
  const jsonStart = responseText.indexOf("[");
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

function cleanBeatLine(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed === "---") return null;

  const withoutBullet = trimmed.replace(/^[-•*]\s*/, "");
  const withoutType = withoutBullet.replace(
    /^(CLAIM|PUSHBACK|FOLLOWUP|HESITATION|AHA|RECAP|NAMED_ITEM|MAIN IDEAS?|QUICK FACTS?|KEY TAKEAWAYS?|STRENGTHS?|WEAKNESSES?|TECHNIQUES?|SUGGESTIONS?|POSITION A|POSITION B|GRAY AREAS?|KEY EVIDENCE):\s*/i,
    ""
  );
  const cleaned = withoutType.replace(/\s+/g, " ").trim();

  if (cleaned.length < 20) return null;
  return cleaned;
}

export function buildFallbackDialogueScriptFromBeats(
  beatsText: string,
  targetLines: number
): DialogueLine[] | null {
  const beats = beatsText
    .split(/\r?\n/)
    .map(cleanBeatLine)
    .filter((beat): beat is string => beat !== null);

  if (beats.length === 0) return null;

  const lineCount = Math.max(2, targetLines);
  const script: DialogueLine[] = [];

  for (let index = 0; index < lineCount; index += 1) {
    const beat = beats[index % beats.length];
    const speaker = index % 2 === 0 ? "host_a" : "host_b";
    const text =
      speaker === "host_a"
        ? beat
        : index === lineCount - 1
          ? `The useful takeaway is that this is not just background detail: ${beat}`
          : `So the pressure point is this: ${beat}`;

    script.push({ speaker, text });
  }

  return script;
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
