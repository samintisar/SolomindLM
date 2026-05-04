"use node";

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
Sample:
  "Look, prompt chaining is basically—you don't ask the model to do five things at once. You break it into steps. Output of step one goes to step two. The reason it works is... well, if step three fails, it fails loudly in isolation. You actually know what broke."
  "Right, but routing is completely different. That's just a classifier sitting at the front door deciding which agent gets the ticket. It's cheap, but if you don't tune the threshold, it's wrong half the time."

host_b is the skeptical audience surrogate. Doesn't just ask questions—challenges assumptions and tries to translate expert jargon into normal terms.
Sample:
  "Wait, 'fails loudly' sounds great in theory, but doesn't the user just end up staring at a wall of broken JSON when step three crashes?"
  "So routing is just a traffic cop. But what happens when a request is weird and doesn't fit any of your predefined buckets? Does it just guess?"

DO NOT include the host names "Asteria" or "Orion" in the dialogue text. Just write
their lines. The speaker labels are JSON metadata.

DO NOT use "..." as a stylistic pause. If a thought is unfinished, write it that way —
"Hold on, that doesn't—" — but don't sprinkle ellipses to fake naturalness.

OPENING:
Start mid-thought, with something specific to this material — a number, a contradiction,
a half-finished question. Never a stock podcast opener. Never "So, today we're talking
about..." or "Welcome back."

NAMED-LIST RECAP (only when applicable):
If the source enumerates a discrete named list and you couldn't cover them all, give ONE of the hosts a casual, hand-wavy recap turn. Do not sound like a robot reading a checklist. Group them or speed-run them naturally.
Example shape (do NOT copy wording literally):
  host_a: "There's like ten others in the book—stuff like multi-agent collaboration, memory management, goal setting... we'd be here all day if we went through them. But they mostly fall into that same bucket of keeping the LLM on rails."

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
