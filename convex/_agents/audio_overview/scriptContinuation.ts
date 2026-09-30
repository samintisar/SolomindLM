import {
  countDialogueWords,
  describeDialogueScriptParseFailure,
  parseDialogueScriptResponse,
  removeRepeatedDialogueLines,
} from "./scriptParsing";
import type { DialogueLine } from "./state";

/** Extend a complete script only when it falls this far short of its word target. */
const CONTINUE_BELOW_TARGET_RATIO = 0.85;
/** A complete script ends with a sign-off exchange; drop it so the continuation doesn't follow a goodbye. */
const SIGN_OFF_LINES = 2;
/** Turns requested when a script only needs a proper ending. */
const WRAP_UP_TURNS = 4;
/** Continuations can ignore the requested turn count; allow this much overshoot. */
const CONTINUATION_OVERSHOOT_RATIO = 1.5;
/** Lines left free under the cap so a wrap-up that runs slightly long keeps its closing. */
const WRAP_UP_ROOM = Math.ceil(WRAP_UP_TURNS * CONTINUATION_OVERSHOOT_RATIO);
/** Keeps one continuation call's JSON output comfortably inside its token budget. */
const MAX_CONTINUATION_TURNS = 250;
const MIN_WORDS_PER_TURN = 10;
const MAX_WORDS_PER_TURN = 25;

/** Scripts may run this far past their requested turns before being trimmed. */
const MAX_LINES_OVER_TARGET_RATIO = 1.2;
/**
 * Hard ceiling on script lines, whatever the length setting: long's full 1.2× overshoot.
 * Synthesis runs in parallel chunks (#257), and 415–418-line episodes synthesized in about
 * 100 seconds on dev.
 */
const MAX_SYNTHESIZABLE_LINES = 420;

/** Line ceiling for a finished script with `targetLines` requested turns. */
export function getScriptMaxLines(targetLines: number): number {
  return Math.min(Math.ceil(targetLines * MAX_LINES_OVER_TARGET_RATIO), MAX_SYNTHESIZABLE_LINES);
}

function countWords(script: DialogueLine[]): number {
  return script.reduce((sum, line) => sum + countDialogueWords(line.text), 0);
}

export type ScriptContinuationPlan = {
  /** Lines of the current script to keep before appending the continuation. */
  keepLines: number;
  /** Turns to request from the continuation call. */
  turns: number;
  /** Only an ending is missing: ask for a short close instead of more content. */
  wrapUp: boolean;
};

/**
 * Decides whether a generated script needs one continuation pass, and how long it should be.
 *
 * - `cutOff` scripts (output truncated at the token limit, or a repetition loop removed) have no
 *   real ending: always continue, at least far enough to wrap up.
 * - Scripts over `maxLines`, even complete ones, are trimmed and given a new ending.
 * - Other complete scripts are extended only when well short of `targetWords`.
 *
 * The turn budget uses the script's own words-per-turn, since models write shorter or longer turns
 * than the prompt's estimate. The script never grows past `maxLines`: synthesis time and memory
 * scale with the number of lines, so a words-driven plan for a short-turn script would otherwise
 * push synthesis past its action limits.
 */
export function planScriptContinuation(input: {
  script: DialogueLine[];
  targetWords: number;
  maxLines: number;
  cutOff: boolean;
}): ScriptContinuationPlan | null {
  const { script, targetWords, maxLines, cutOff } = input;
  if (script.length === 0) return null;

  const overCap = script.length > maxLines;
  const needsEnding = cutOff || overCap;
  if (!needsEnding && countWords(script) >= targetWords * CONTINUE_BELOW_TARGET_RATIO) {
    return null;
  }

  const keepLines = needsEnding
    ? Math.max(1, Math.min(script.length, maxLines - WRAP_UP_ROOM))
    : Math.max(1, script.length - SIGN_OFF_LINES);
  const room = maxLines - keepLines;
  // A complete script near the cap keeps its own ending.
  if (!needsEnding && room <= WRAP_UP_ROOM) return null;
  const kept = script.slice(0, keepLines);
  const wordsPerTurn = Math.min(
    MAX_WORDS_PER_TURN,
    Math.max(MIN_WORDS_PER_TURN, countWords(kept) / kept.length)
  );
  const missingTurns = Math.ceil(Math.max(0, targetWords - countWords(kept)) / wordsPerTurn);

  const wrapUp = overCap || missingTurns <= WRAP_UP_TURNS || room <= WRAP_UP_ROOM;

  return {
    keepLines,
    turns: wrapUp ? WRAP_UP_TURNS : Math.min(MAX_CONTINUATION_TURNS, room, missingTurns),
    wrapUp,
  };
}
/** Output tokens budgeted per turn: ~20 words of text plus JSON framing, with room for CJK. */
const OUTPUT_TOKENS_PER_TURN = 60;
const OUTPUT_TOKENS_OVERHEAD = 256;
/** A second pass only asks for a wrap-up, when the first continuation came back without an ending. */
const MAX_CONTINUATION_PASSES = 2;

/**
 * Output token budget for a continuation of `turns` turns (plus overshoot), capped at `limit`.
 * Bounding output lets a runaway continuation stop itself instead of running into the timeout.
 */
export function getContinuationMaxTokens(turns: number, limit: number): number {
  return Math.min(
    limit,
    Math.ceil(turns * CONTINUATION_OVERSHOOT_RATIO * OUTPUT_TOKENS_PER_TURN) +
      OUTPUT_TOKENS_OVERHEAD
  );
}

/**
 * Runs continuation passes (see {@link planScriptContinuation}) and appends their new turns,
 * dropping any that repeat the script so far. A continuation that was cut off, ran past its turn
 * budget, or ended in a repetition loop has no closing, so one follow-up pass asks only for a
 * wrap-up. The script as generated is already usable, so a failed or unusable continuation is
 * logged and the script so far is returned, trimmed to `maxLines`.
 */
export async function continueScriptIfNeeded(options: {
  script: DialogueLine[];
  cutOff: boolean;
  targetWords: number;
  /** The finished script never exceeds this many lines. */
  maxLines: number;
  /** Return false when the phase's time budget no longer allows another model call. */
  canContinue: () => boolean;
  /**
   * Produces the raw model response continuing `scriptSoFar` with ~`turns` new turns, or, when
   * `wrapUp` is set, with a short closing.
   */
  generate: (scriptSoFar: DialogueLine[], turns: number, wrapUp: boolean) => Promise<string>;
}): Promise<DialogueLine[]> {
  const { targetWords, maxLines, canContinue, generate } = options;
  let script = options.script;
  let cutOff = options.cutOff;
  // Falling back to the script so far must still respect the cap, even at the cost of its ending.
  const keepScript = () => (script.length > maxLines ? script.slice(0, maxLines) : script);

  for (let pass = 1; pass <= MAX_CONTINUATION_PASSES; pass += 1) {
    const plan = planScriptContinuation({ script, targetWords, maxLines, cutOff });
    if (!plan) return script;
    if (!canContinue()) {
      console.warn(
        "[AudioScript] Continuation needed but the time budget is spent; keeping script"
      );
      return keepScript();
    }

    const wrapUp = pass > 1 || plan.wrapUp;
    const turns = wrapUp ? WRAP_UP_TURNS : plan.turns;
    const kept = script.slice(0, plan.keepLines);
    try {
      const parsed = parseDialogueScriptResponse(await generate(kept, turns, wrapUp), 1);
      if (!parsed.ok) {
        console.warn(
          `[AudioScript] Continuation unusable (${describeDialogueScriptParseFailure(parsed)}); keeping script`
        );
        return keepScript();
      }
      // Keep a runaway continuation's first turns; they follow on from the script so far.
      const maxAdded = Math.min(
        Math.ceil(turns * CONTINUATION_OVERSHOOT_RATIO),
        maxLines - plan.keepLines
      );
      const added = parsed.script.slice(0, maxAdded);
      const merged = removeRepeatedDialogueLines([...kept, ...added]);
      script = merged.script;
      cutOff = parsed.truncated || parsed.script.length > maxAdded || merged.endedInRepeat;
      console.log(
        `[AudioScript] Continuation pass ${pass}${wrapUp ? " (wrap-up)" : ""}: kept ${kept.length} lines, requested ${turns}, appended ${script.length - kept.length}, hasEnding=${!cutOff}`
      );
      if (!cutOff) return script;
    } catch (error) {
      console.warn(
        `[AudioScript] Continuation failed (${error instanceof Error ? error.message : String(error)}); keeping script`
      );
      return keepScript();
    }
  }

  console.warn("[AudioScript] Continuation still has no ending after the wrap-up pass");
  return script;
}
