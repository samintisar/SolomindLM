"use node"
import { MARKDOWN_MATH_NOTATION_FOR_APP } from '../_shared/markdownMathPrompt.js';

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
export const MAP_SYSTEM_PROMPT = 'You are extracting engaging content for a podcast conversation. Extract key points that would make for interesting discussion.';

/** System prompt for reduce phase script writing */
export const REDUCE_SYSTEM_PROMPT = 'You are an expert podcast scriptwriter. Write natural, varied two-host dialogue—avoid repetitive openers and stock hooks. Output ONLY valid JSON arrays of dialogue lines.';

/** System prompt for example extraction for anti-repetition */
export const EXAMPLE_EXTRACTION_SYSTEM_PROMPT = 'You are a text analyzer. Extract concrete examples as a JSON array only.';

// ============================================================
// Types
// ============================================================

/**
 * Audio type for the overview.
 */
export type AudioType = 'deep_dive' | 'brief' | 'critique' | 'debate';

/**
 * Audio length target.
 */
export type AudioLength = 'short' | 'default' | 'long';

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
  deep_dive: `Analyze this text and extract "dialogue beats" for an engaging podcast conversation.

For EACH major point, extract:
- The core fact/concept (what it is)
- Why it matters (significance)
- A concrete example or analogy
- A potential debate angle or counterpoint
- Follow-up questions a curious listener would ask

Extract at least 8-12 dialogue beats from this chunk to ensure rich conversation material.

Focus on:
- Surprising facts or data points that would make listeners say "Wow!"
- Controversial statements or counterintuitive ideas that could spark debate
- Complex concepts that need simple analogies to understand
- Personal stories or vivid examples that bring content to life
- Discussion points that would make great conversation starters

Format as a bulleted list with clear categories:
• Surprising Facts: [bulleted list with details]
• Controversial Points: [bulleted list with debate angles]
• Complex Concepts: [with brief explanations and analogies]
• Discussion Starters: [conversation topics with follow-up questions]
• Examples & Stories: [concrete illustrations]

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

CRITICAL LENGTH REQUIREMENTS:
- Generate EXACTLY {targetLines} speaker turns (JSON objects with "speaker" and "text")
- Each turn should usually be 2-5 sentences (roughly 25-55 words). Prefer fuller turns over choppy one-liners—listeners should hear real paragraphs, not ping-pong quips
- Occasionally let one host speak twice in a row when they are explaining a concept, telling a mini-story, or answering a multi-part question (then the other host responds)
- Total target: approximately {estimatedWords} words
- DO NOT summarize - explore topics in depth with examples, elaboration, and follow-up questions
- Include natural tangents and deeper dives into interesting points
- Add "thinking out loud" moments where hosts process information

ANTI-REPETITION RULES:
- Build on previous discussion rather than repeating it
- If a concept was explained before, refer to it briefly and move to NEW aspects
- You MAY discuss different concepts, rules, or aspects of the same topic
  - Example: If "A*" was covered, you can still discuss "admissibility", "consistency", or "complexity"
  - Example: If "BFS" was covered, you can still discuss "DFS comparison" or "optimality proofs"
- Use DIFFERENT examples and analogies - don't reuse them from earlier parts
- Each chunk should feel like a progression forward, not a restatement

{coveredTopicsPrompt}

HOST PERSONALITIES:
- host_a (Asteria - Expert): Knowledgeable, explains concepts clearly, provides specific details, cites evidence, sounds authoritative but accessible. Vary acknowledgments—do not open most replies with "Right," or "Exactly," (use sparingly across the whole script). Mix in "So," "One thing that stands out," "The short version is," "What the data actually shows," and direct answers without a verbal tic
- host_b (Orion - Interviewer): Genuinely curious and intellectually engaged. Asks thoughtful follow-up questions, makes connections, reacts with varied language—rotate "That's fascinating," "I hadn't considered that," "So what you're saying is," "Walk me through," "How does that square with..." Avoid repeating the same reaction phrase in consecutive turns

NATURALNESS REQUIREMENTS FOR PODCAST DIALOGUE:
- host_b should sound intellectually curious and engaged - excited about ideas, not just shocked
- Include thoughtful reactions: "That's really interesting," "That's a great way to put it," "I see what you mean," "That connects to something you said earlier"
- Add hesitation markers naturally: "Hmm," "let me think about this," "so in other words" (but not excessive)
- Use emphasis words thoughtfully: "really," "actually," "essentially," "fundamentally" - for clarity, not drama
- host_b should respond with genuine engagement: "That's a great point," "That helps me understand," "I hadn't thought of it that way"
- Add breathing room with "..." for thoughtful pauses when processing complex ideas
- Both hosts should show authentic intellectual engagement - excited about learning, not performing

GUIDELINES FOR NATURAL CONVERSATION:
1. Alternate speakers in a human rhythm: default is back-and-forth, but break strict A-B-A-B when it helps—two turns from the same host in a row is fine for explanations, stories, or a quick follow-up
2. Keep most turns substantive (2-5 sentences; avoid a script of single-sentence ping-pong)
3. host_a provides explanations and depth, host_b reacts and asks follow-ups
4. OPENING: Start from the actual material—a striking number, a tension, a question, or a plain-spoken summary of why this matters. NEVER use a canned podcast opener; do not begin with "So, here's something wild" or any fixed stock phrase. The first line should sound specific to this topic
5. End with a summary reflection or takeaway
6. Make it sound like two real people talking, not reading a script
7. When something is surprising or insightful, host_b responds with varied wording—not the same praise every time
8. Use "..." sparingly for thoughtful pauses when processing complex ideas
9. host_b should ask clarifying questions that help listeners understand; vary how those questions start

ANTI-ROBOTIC RULES (critical):
- Do not begin more than one host_a turn in the entire script with "Right," — same for "Exactly," as a sentence starter
- Do not mirror the same sentence structure every turn (e.g. every line starting with the same filler)
- Vary energy: some turns are short reactions, others are longer explanations—avoid uniform length every time

EXAMPLES OF ENGAGING DIALOGUE (structure and rhythm—do not copy wording literally):
host_b: "That's a really interesting point... so you're saying that [concept] works like [analogy]?"
host_a: "You've got it. What's particularly noteworthy is how [detail] connects to [broader principle]."
host_b: "That helps me understand it better. But what about [edge case]?"
host_a: "Great question—that's where [nuance] comes in. [One or two more sentences unpacking it.]"
host_b: "Okay, so it's not just [simple view], it's actually [more sophisticated view]."

AUDIO TYPE: {audioType}
TARGET LENGTH: {targetLines} dialogue turns (~{estimatedWords} words)
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
  const focusLine = focus ? `\n\nFOCUS AREA: Prioritize content related to: "${focus}"` : '';
  return promptTemplate.replace('{chunk}', chunk) + focusLine;
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

  return REDUCE_PROMPT.replace('{coveredTopicsPrompt}', params.coveredTopicsPrompt || '')
    .replace('{content}', params.content)
    .replace('{audioType}', params.audioType)
    .replace('{targetLines}', params.targetLines.toString())
    .replace('{estimatedWords}', estimatedWords.toString())
    .replace('{focus}', params.focus || 'general overview');
}

/**
 * Builds the covered topics prompt for anti-repetition.
 */
export function buildCoveredTopicsPrompt(examples: string[]): string {
  if (examples.length === 0) return '';

  const selectedExamples = examples.slice(0, 8);
  if (selectedExamples.length > 0) {
    return `\nEXAMPLES ALREADY USED (please use different ones):\n${selectedExamples.join(', ')}\n`;
  }
  return '';
}
