"use node";

/**
 * Prompts for AudioOverviewGraph.
 *
 * Contains all prompt templates for map and reduce phases
 * of audio overview generation.
 */

import { fillTemplate } from "../_shared/promptTemplate";
import type { DialogueLine } from "./state";

// ============================================================
// System Prompts
// ============================================================

/** System prompt for map phase dialogue beat extraction */
export const MAP_SYSTEM_PROMPT =
  "You are extracting engaging content for a podcast conversation. Extract key points that would make for interesting discussion.";

/** System prompt for reduce phase script writing */
export const REDUCE_SYSTEM_PROMPT =
  "You are an expert podcast scriptwriter. Write natural, varied two-host dialogue—avoid repetitive openers and stock hooks. Output ONLY valid JSON arrays of dialogue lines.";

/** System prompt for example extraction for anti-repetition */
export const EXAMPLE_EXTRACTION_SYSTEM_PROMPT =
  "You are a text analyzer. Extract concrete examples as a JSON array only.";

// ============================================================
// Types
// ============================================================

/**
 * Audio type for the overview.
 */
export type AudioType = "deep_dive" | "brief" | "critique" | "debate";

/**
 * Audio length target.
 */
export type AudioLength = "short" | "default" | "long";

// ============================================================
// Constants
// ============================================================

/** Target line counts for different audio lengths */
export const TARGET_LINE_COUNTS: Record<AudioLength, number> = {
  short: 100, // ~12 minutes (2000 words)
  default: 220, // ~27 minutes (4400 words)
  long: 350, // ~43 minutes (7000 words)
} as const;

/** Estimated words per dialogue line */
export const ESTIMATED_WORDS_PER_LINE = 20;

/** Dialogue chunk size to avoid token limits */
export const DIALOGUE_CHUNK_SIZE = 30;

// ============================================================
// Map Prompts (per audio type)
// ============================================================

/** Map prompts for each audio type */
export const MAP_PROMPTS: Record<AudioType, string> = {
  deep_dive: `Read this chunk and extract material that's ready to become a real
two-host conversation. Each "beat" is ONE conversational move, not one fact.
Stay specific — pull verbatim numbers, proper nouns, and contrasts the chunk
gives you. Do NOT paraphrase into generic statements; the reducer can't recover
specificity once you smooth it out.

Tag each beat by the kind of move it is, so the reducer can stitch them into
uneven, lifelike dialogue:

- CLAIM:       A specific assertion the expert host can make. Include the evidence
               inline (number, citation, name).
- PUSHBACK:    A real objection or "wait, but —" the curious host would raise.
               Should poke at hand-waviness, missing definitions, or weak evidence
               in the source — not just ask for elaboration.
- FOLLOWUP:    A question that takes the discussion one layer deeper. Prefer
               "what happens when X breaks?" or "how is this different from Y?"
               over "can you tell me more about X?"
- HESITATION:  A spot where one host backs up, qualifies, or admits the source is
               fuzzy. ("Honestly, the source doesn't pin a number on this — they
               give a 5–20% range, so treat it as a range.")
- AHA:         A connection between two ideas the source doesn't draw explicitly.
- RECAP:       A short summary the hosts can use to round out a stretch.
- NAMED_ITEM:  Use ONLY when the chunk introduces a discrete named-list item
               (a stage, principle, rule, step, type, or law the source names
               and enumerates). Use the exact name verbatim. The reducer relies on
               these to guarantee complete coverage of the source's named list.
               Emit ONE NAMED_ITEM per named item appearing in this chunk; do
               not collapse them.

Produce 8–12 beats from this chunk with a mix of types. CLAIM-only stretches
read robotic — intersperse PUSHBACK / HESITATION / FOLLOWUP. NAMED_ITEM beats
are mandatory whenever the chunk introduces a named list item, and they do NOT
count against the 8–12 target — emit them in addition.

Format: each beat on its own line, prefixed with the type and a colon.

Illustrative example (unrelated topic — do not copy the wording):
CLAIM: The study followed 1,200 households for six years and found savings rates fell 4 points after the tax change.
PUSHBACK: Six years sounds solid, but they only surveyed urban households — rural savers could look completely different.
FOLLOWUP: What happens to the result if the tax change and the recession overlapped in the same year?
HESITATION: The source is loose on "household" — early on it counts roommates, later it doesn't, without flagging the switch.
NAMED_ITEM: Stage 2: consolidation — the new habit is repeated until it no longer needs a reminder.

TEXT TO ANALYZE:
{chunk}`,

  brief: `Analyze this text and extract the most essential key takeaways for a quick audio overview.

Focus on:
- Core ideas and main themes
- Critical information listeners must know
- Quick facts that capture the essence
- Actionable insights or conclusions

Extract at least 6-8 key points to ensure adequate coverage.

Format as a concise bulleted list:
• Main Ideas: [bulleted list with brief explanations]
• Quick Facts: [essential information]
• Key Takeaways: [actionable insights]

TEXT TO ANALYZE:
{chunk}`,

  critique: `Analyze this text from a critical perspective and extract points for an expert review.

Focus on:
- Strengths: What works well, what's effective
- Weaknesses: Areas for improvement, gaps, issues
- Notable techniques: Interesting methods, approaches
- Constructive feedback: Specific suggestions

Extract at least 6-8 critique points.

Format as a structured critique:
• Strengths: [what works with specific examples]
• Weaknesses: [what needs improvement with details]
• Techniques: [interesting approaches]
• Suggestions: [constructive feedback]

TEXT TO ANALYZE:
{chunk}`,

  debate: `Analyze this text for conflicting viewpoints, tensions, and debate-worthy content.

Focus on:
- Argument A: One side of the issue
- Argument B: The opposing view
- Gray areas: Nuanced positions, middle ground
- Evidence: What data supports each side

Extract at least 6-8 debate points with supporting evidence.

Format as debate material:
• Position A: [one viewpoint with reasoning]
• Position B: [opposing viewpoint with reasoning]
• Gray Areas: [nuanced aspects]
• Key Evidence: [supporting data for each side]

TEXT TO ANALYZE:
{chunk}`,
};

// ============================================================
// Reduce Prompt (dialogue script generation)
// ============================================================

/** Main reduce prompt for generating dialogue scripts */
export const REDUCE_PROMPT = `You are an expert podcast scriptwriter. Convert the following "dialogue beats" into a lively, messy, natural conversation script between two hosts.

CRITICAL REQUIREMENT:
Output ONLY a valid JSON array of dialogue lines with this exact format:
[
  {"speaker": "host_a", "text": "..."},
  {"speaker": "host_b", "text": "..."}
]

CONVERSATIONAL DYNAMICS (CRITICAL):
- NO Q&A PING-PONG: Host B must not just ask a series of interview questions. Host B should synthesize, make analogies, disagree, or finish Host A's sentences.
- USE IMPERFECTIONS: Real people don't speak in perfect paragraphs. Use em-dashes (—) heavily for interruptions, self-corrections mid-sentence, and trailing off. 
- ACTIVE LISTENING: Start turns with natural discourse markers like "Right,", "Yeah,", "Wait, but—", "Look,", or "I mean...".
- NO DICTIONARY DEFINITIONS: Explain concepts casually, as if talking at a whiteboard, not reading from a textbook.

LENGTH REQUIREMENT (MANDATORY):
- You MUST generate approximately {targetLines} dialogue turns / ~{estimatedWords} words.
  This is a HARD TARGET, not a suggestion. Count your turns as you write.
- Use EVERY beat provided. If you have 40+ beats, each one should become at least
  one turn (often 2-3). Draw out implications, show connections, let hosts react
  to each other. Do NOT rush through beats to finish early.
- A reaction can be two words; an explanation can be six sentences. Same speaker
  can take two or three turns in a row when telling a mini-story, working out an
  argument, or recovering from a misspoken phrase.
- DO NOT summarize. Stay specific. If a beat hands you a number, an example, or
  a counterpoint, use it verbatim. Do not compress multiple beats into one turn.
- SELF-CHECK: Before closing the JSON array, verify you have generated close to
  {targetLines} turns. If you have fewer than {targetLines} * 0.9 turns, continue
  the conversation with remaining beats. Do not end early.

ANTI-REPETITION:
- Build on what was already said; don't restate it.
- If a concept was already explained, jump to a new angle on it (consequences, edge cases,
  comparison to a sibling concept) rather than re-explaining.
- Don't reuse examples or analogies from earlier turns.

{coveredTopicsPrompt}

HOST VOICES:

host_a is the domain expert. Passionate but a bit scattered. Often self-corrects mid-thought. Drops in specific numbers and proper nouns casually.
Sample (unrelated topic — match the voice, not the content):
  "Look, the whole trick with compound interest is—you're not earning on what you put in, you're earning on what you earned. Year one it's boring. Year twenty it's most of the balance. That's why the first ten years matter more than people think."
  "Right, but inflation is a completely different animal. It doesn't care about your balance, it eats the purchasing power of every dollar. Three percent a year sounds tiny until you realize prices double in about twenty-four years."

host_b is the skeptical audience surrogate. Doesn't just ask questions—challenges assumptions and tries to translate expert jargon into normal terms.
Sample:
  "Wait, 'the first ten years matter more' sounds great in theory, but who actually has spare money to invest at twenty-two?"
  "So inflation is basically a slow leak. But if everything costs more, don't wages go up too? Or is that the catch?"

DO NOT include the host names "Asteria" or "Orion" in the dialogue text. Just write
their lines. The speaker labels are JSON metadata.

DO NOT use "..." as a stylistic pause. If a thought is unfinished, write it that way —
"Hold on, that doesn't—" — but don't sprinkle ellipses to fake naturalness.

OPENING:
Start mid-thought, with something specific to this material — a number, a contradiction,
a half-finished question. Never a stock podcast opener. Never "So, today we're talking
about..." or "Welcome back."

NAMED LISTS (only when applicable):
If the beats include NAMED_ITEM entries and the hosts can't dig into all of them, give ONE of the hosts a quick, casual run-through turn for the rest. Group them or speed-run them naturally — not a robot reading a checklist.
Example shape (unrelated topic — do NOT copy wording):
  host_a: "The other three stages go fast—storming, norming, then performing. Honestly the model gets criticized for implying teams move through them in order, which the source admits they usually don't."

ENDING:
Only after generating close to {targetLines} turns, give host_b one brief closing
turn (1–2 sentences) — a takeaway or sign-off — and then close the JSON array.
DO NOT end early. If you have not yet reached {targetLines} turns, continue the
conversation using remaining beats or exploring implications of covered material.

AUDIO TYPE: {audioType}
REQUIRED LENGTH: {targetLines} turns / ~{estimatedWords} words (MANDATORY)
FOCUS AREA: {focus}

SOURCE MATERIAL (dialogue beats):
{content}

Generate the dialogue script as a JSON array. Output ONLY the JSON, no markdown formatting:`;

/** Continues a dialogue script that ended early or was cut off. */
export const CONTINUATION_PROMPT = `You are continuing a two-host podcast script that stopped before it was finished. Write the NEXT dialogue turns so the conversation picks up seamlessly from the last line of the script so far.

Output ONLY a valid JSON array of the NEW dialogue lines (do not repeat the script so far):
[
  {"speaker": "host_a", "text": "..."},
  {"speaker": "host_b", "text": "..."}
]

RULES:
- Write approximately {turns} new turns.
- The first new turn must respond naturally to the last line of the script so far.
- Prioritize beats from the source material that the script so far has not covered, or covered only in passing. Go deeper on them: consequences, edge cases, disagreements, concrete numbers and names from the beats.
- Do NOT restate points, examples, or analogies already used in the script so far. Do NOT restart the episode or re-introduce the topic.
- Keep the same voices: host_a is the scattered but specific domain expert; host_b is the skeptical audience surrogate who challenges and translates.
- Do not use "..." as a stylistic pause. Do not include host names in the text.
- End with host_b giving one brief closing turn (1–2 sentences), then close the JSON array.

AUDIO TYPE: {audioType}
FOCUS AREA: {focus}

SOURCE MATERIAL (dialogue beats):
{content}

SCRIPT SO FAR (JSON):
{scriptSoFar}

Write the next ~{turns} turns as a JSON array. Output ONLY the JSON, no markdown formatting:`;

/** Ends a dialogue script that stopped mid-conversation. */
export const WRAP_UP_PROMPT = `You are finishing a two-host podcast script that stops mid-conversation. Write the FINAL 2–4 dialogue turns that bring the episode to a natural close.

Output ONLY a valid JSON array of the NEW dialogue lines (do not repeat the script so far):
[
  {"speaker": "host_a", "text": "..."},
  {"speaker": "host_b", "text": "..."}
]

RULES:
- The first new turn responds to the last line of the script so far and settles that point in a sentence or two.
- Do NOT raise new topics, questions, or examples. This is the end of the episode.
- The LAST turn is host_b's closing: one or two sentences with a takeaway or sign-off for the listener.
- Write no more than 4 turns.
- Keep the same voices: host_a is the scattered but specific domain expert; host_b is the skeptical audience surrogate who challenges and translates.
- Do not use "..." as a stylistic pause. Do not include host names in the text.

AUDIO TYPE: {audioType}
FOCUS AREA: {focus}

SCRIPT SO FAR (JSON):
{scriptSoFar}

Write the final turns as a JSON array. Output ONLY the JSON, no markdown formatting:`;

// ============================================================
// Helper Functions
// ============================================================

/**
 * Gets the map prompt for a specific audio type.
 */
export function getMapPrompt(audioType: AudioType, chunk: string, focus?: string): string {
  const promptTemplate = MAP_PROMPTS[audioType] || MAP_PROMPTS.deep_dive;
  const focusLine = focus ? `\n\nFOCUS AREA: Prioritize content related to: "${focus}"` : "";
  return fillTemplate(promptTemplate, { chunk }) + focusLine;
}

/**
 * Gets the reduce prompt with parameters substituted.
 */
export function getReducePrompt(params: {
  content: string;
  audioType: AudioType;
  length: AudioLength;
  focus: string;
  targetLines: number;
  coveredTopicsPrompt?: string;
}): string {
  const estimatedWords = params.targetLines * ESTIMATED_WORDS_PER_LINE;

  return fillTemplate(REDUCE_PROMPT, {
    coveredTopicsPrompt: params.coveredTopicsPrompt || "",
    content: params.content,
    audioType: params.audioType,
    targetLines: params.targetLines.toString(),
    estimatedWords: estimatedWords.toString(),
    focus: params.focus || "general overview",
  });
}

/**
 * Gets the continuation prompt for extending a script that ended early or was cut off.
 */
export function getContinuationPrompt(params: {
  content: string;
  scriptSoFar: DialogueLine[];
  turns: number;
  audioType: AudioType;
  focus: string;
}): string {
  return fillTemplate(CONTINUATION_PROMPT, {
    content: params.content,
    scriptSoFar: JSON.stringify(params.scriptSoFar),
    turns: params.turns.toString(),
    audioType: params.audioType,
    focus: params.focus || "general overview",
  });
}

/**
 * Gets the wrap-up prompt for ending a script that stops mid-conversation.
 */
export function getWrapUpPrompt(params: {
  scriptSoFar: DialogueLine[];
  audioType: AudioType;
  focus: string;
}): string {
  return fillTemplate(WRAP_UP_PROMPT, {
    scriptSoFar: JSON.stringify(params.scriptSoFar),
    audioType: params.audioType,
    focus: params.focus || "general overview",
  });
}

/**
 * Builds the covered topics prompt for anti-repetition.
 */
export function buildCoveredTopicsPrompt(examples: string[]): string {
  if (examples.length === 0) return "";

  const selectedExamples = examples.slice(0, 8);
  if (selectedExamples.length > 0) {
    return `\nEXAMPLES ALREADY USED (please use different ones):\n${selectedExamples.join(", ")}\n`;
  }
  return "";
}
