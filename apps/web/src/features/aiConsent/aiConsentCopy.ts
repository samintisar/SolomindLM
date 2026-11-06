/**
 * Version of the consent text. Bump it when a provider is added or what one receives changes:
 * every mobile user is asked again. Keep this table in sync with the privacy policy and
 * App Store Connect → App Privacy.
 */
export const AI_CONSENT_VERSION = 1;

export interface AiProviderDisclosure {
  name: string;
  /** What the provider receives. */
  data: string;
  /** Why it receives it. */
  purpose: string;
}

export const AI_PROVIDERS: readonly AiProviderDisclosure[] = [
  {
    name: "Together AI",
    data: "Your questions, your sources, and audio you upload or record",
    purpose: "to write answers, notes, quizzes, audio and grading",
  },
  {
    name: "OpenAI",
    data: "Your questions, source text and infographic prompts",
    purpose: "to index and search your sources and draw infographics",
  },
  {
    name: "Voyage AI",
    data: "Your questions and passages from your sources",
    purpose: "to rank the most relevant passages",
  },
  {
    name: "Mistral",
    data: "PDFs and images you upload",
    purpose: "to read their text",
  },
  {
    name: "Tavily",
    data: "Search terms",
    purpose: "to find web sources",
  },
  {
    name: "Supadata",
    data: "Links you add",
    purpose: "to fetch web pages and video transcripts",
  },
];
