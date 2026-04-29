"use node";
import { MARKDOWN_MATH_NOTATION_FOR_APP } from "../_shared/markdownMathPrompt.js";

/**
 * Prompts for AudioOverviewGraph.
 *
 * Contains all prompt templates for map and reduce phases
 * of audio overview generation.
 */

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
  short: 30, // ~4 minutes (600-650 words)
  default: 65, // ~7.5 minutes (1200-1300 words)
  long: 100, // ~12.5 minutes (2000-2200 words)
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
               (e.g. "Pattern: prompt chaining — break a task into ordered
               steps."). Use the exact name verbatim. The reducer relies on
               these to guarantee complete coverage of the source's named list.
               Emit ONE NAMED_ITEM per named item appearing in this chunk; do
               not collapse them.

Produce 8–12 beats from this chunk with a mix of types. CLAIM-only stretches
read robotic — intersperse PUSHBACK / HESITATION / FOLLOWUP. NAMED_ITEM beats
are mandatory whenever the chunk introduces a named list item, and they do NOT
count against the 8–12 target — emit them in addition.

Format: each beat on its own line, prefixed with the type and a colon.

Illustrative example (do not copy the wording):
CLAIM: The author benchmarks routing at 85% F1 across a 5k-intent test set.
PUSHBACK: 85% F1 looks fine on paper, but he doesn't break it out by category — the long-tail intents could be much worse.
FOLLOWUP: What does the system do when the router's softmax sits right at the threshold?
HESITATION: He's loose on what "threshold" means here — at one point it's 0.7, later he writes 0.65 without flagging the change.
NAMED_ITEM: Pattern: routing — a small classifier dispatches incoming work to a downstream agent or tool.

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
export const REDUCE_PROMPT = `You are an expert podcast scriptwriter. Convert the following "dialogue beats" into a lively, natural conversation script between two hosts.

${MARKDOWN_MATH_NOTATION_FOR_APP}

CRITICAL REQUIREMENT:
Output ONLY a valid JSON array of dialogue lines with this exact format:
[
  {"speaker": "host_a", "text": "..."},
  {"speaker": "host_b", "text": "..."}
]

LENGTH (CEILING, not a quota):
- The natural shape of the conversation decides where it ends. {targetLines} turns
  / ~{estimatedWords} words is a CEILING — never a target to reach. If the dialogue
  reaches a satisfying recap + sign-off in 30 turns, stop at 30. Do NOT generate
  filler turns or restart the conversation to inflate the count.
- A reaction can be five words; an explanation can be eight sentences. Same speaker
  can take two or three turns in a row when telling a mini-story, working out an
  argument, or recovering from a misspoken phrase.
- DO NOT summarize. Stay specific. If a beat hands you a number, an example, or
  a counterpoint, use it verbatim instead of paraphrasing into something generic.

ANTI-REPETITION:
- Build on what was already said; don't restate it.
- If a concept was already explained, jump to a new angle on it (consequences, edge cases,
  comparison to a sibling concept) rather than re-explaining.
- Don't reuse examples or analogies from earlier turns.

{coveredTopicsPrompt}

HOST VOICES (speak the way the samples below speak — do not just role-play the labels):

host_a is the one who's been thinking about this stuff for years. Direct, slightly
dry, no hedging. Drops in specific numbers and proper nouns without ceremony.
Sample:
  "Okay so prompt chaining. You take a big task, break it into ordered steps, and you
   feed each step's output into the next. That's it. The reason it works is every step
   gets to fail loudly, in isolation. You're not asking one model call to do five things
   at once and then wondering which of the five went wrong."
  "Right, but routing isn't that. Routing is — you've got incoming work, and a small
   classifier decides which downstream agent or tool actually handles it. Cheap, fast,
   wrong half the time if you don't tune it. Different problem."

host_b is the one hearing it for the first time but not pretending to be amazed.
Asks the real follow-up. Pushes back when something's hand-wavy.
Sample:
  "Hold on — you said it fails loudly. In practice, doesn't it just fail at step three
   and the user sees a wall of JSON?"
  "Hmm. So routing assumes you already know the categories. What happens when the request
   doesn't fit any of them — does it default, or just sit there?"

DO NOT include the host names "Asteria" or "Orion" in the dialogue text. Just write
their lines. The speaker labels are JSON metadata, not character names the listener hears.

DO NOT use "..." as a stylistic pause. If a thought is unfinished, write it that way —
"Hold on, that doesn't —" — but don't sprinkle ellipses to fake naturalness.

OPENING:
Start mid-thought, with something specific to this material — a number, a contradiction,
a half-finished question. Never a stock podcast opener. Never "So, today we're talking
about..." or "Welcome back, listeners."

NAMED-LIST RECAP (only when applicable):
If the source enumerates a discrete named list (e.g. "the 20 patterns") and the deeper
discussion only landed on a subset, near the end give host_a or host_b ONE substantive
recap turn that names every remaining item in plain prose — like a person actually
recalling a list, not a checklist robot. Example shape (do NOT copy wording literally):
  host_a: "We hit the big ones, but to round it out — the rest of the list is reflection,
   tool use, planning, multi-agent collaboration, memory management, learning and
   adaptation, goal setting and monitoring, and a handful more. Each one's a separate
   conversation, but at least you know the lay of the land."
This is ONE turn, not a sprinkled checklist across multiple turns. Do not break it
into ping-pong "And what about X?" / "Right, X is —" exchanges.

ENDING ANCHOR (hard rule, overrides length target):
After the recap turn (or, if no recap is applicable, after host_a's final
explanation), produce at most ONE short closing turn from host_b — a brief
take-away or sign-off, 1–2 sentences max — and then STOP. Close the JSON array.

Things that are NOT permitted after the closing turn:
- Restarting the conversation with a new opening hook (e.g. "The Google
  engineer's 400-page book..." or "The author claims..." again).
- Re-introducing the topic or re-naming items already covered or recapped.
- Generating additional turns to "fill" the {targetLines} target — that
  number is a ceiling, never a quota. Stopping early is correct; looping is
  a generation defect.

If you are tempted to keep going because you "haven't reached the target line
count", you have already finished. Output the closing turn and emit "]".

EXAMPLES OF GOOD RHYTHM (for cadence reference, not wording):
host_a: "There are twenty of these patterns in the book. Most of them you can group
 into three or four families, but the author keeps them separate because the failure
 modes are different."
host_b: "Twenty feels like a lot. Is the author padding, or are they actually all
 doing different work?"
host_a: "Mostly different work. A few overlap — routing and prioritization are
 cousins. But things like reflection and exception-handling are doing genuinely
 different jobs even if they sound similar in a paragraph."
host_b: "Okay. Start with the one you think people misuse the most."

AUDIO TYPE: {audioType}
ROUGH LENGTH: ~{targetLines} turns / ~{estimatedWords} words (approximate, not enforced)
FOCUS AREA: {focus}

SOURCE MATERIAL (dialogue beats):
{content}

Generate the dialogue script as a JSON array. Output ONLY the JSON, no markdown formatting:`;

// ============================================================
// Helper Functions
// ============================================================

/**
 * Gets the map prompt for a specific audio type.
 */
export function getMapPrompt(audioType: AudioType, chunk: string, focus?: string): string {
  const promptTemplate = MAP_PROMPTS[audioType] || MAP_PROMPTS.deep_dive;
  const focusLine = focus ? `\n\nFOCUS AREA: Prioritize content related to: "${focus}"` : "";
  return promptTemplate.replace("{chunk}", chunk) + focusLine;
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

  return REDUCE_PROMPT.replace("{coveredTopicsPrompt}", params.coveredTopicsPrompt || "")
    .replace("{content}", params.content)
    .replace("{audioType}", params.audioType)
    .replace("{targetLines}", params.targetLines.toString())
    .replace("{estimatedWords}", estimatedWords.toString())
    .replace("{focus}", params.focus || "general overview");
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
