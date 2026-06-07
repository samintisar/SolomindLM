import { STUDIO_TOOLS } from "@/shared/constants";

export interface FAQItem {
  question: string;
  answer: string;
}

const LANDING_CHAT_TOOLS = [
  { id: "chat", label: "AI Chat", iconName: "MessageCircle", color: "text-sky-700" },
  { id: "deepResearch", label: "Deep Research", iconName: "Telescope", color: "text-indigo-700" },
  {
    id: "literatureReview",
    label: "Literature Review",
    iconName: "FileText",
    color: "text-orange-600",
  },
] as const;

const LANDING_TOOLS = [
  { id: "rag", label: "Grounded RAG System", iconName: "Brain", color: "text-purple-700" },
  ...LANDING_CHAT_TOOLS,
  ...STUDIO_TOOLS,
];

const LANDING_FEATURE_COLOR_BY_ID = new Map(
  LANDING_TOOLS.map((tool) => [tool.id, tool.color] as const)
);

export function getLandingFeatureColor(id: string): string {
  return LANDING_FEATURE_COLOR_BY_ID.get(id) ?? "text-primary";
}

export const LANDING_CONTENT = {
  hero: {
    headline: "Transform How You Learn with AI",
    subheadline:
      "Upload any content—PDFs, videos, articles—and generate flashcards, quizzes, mind maps, and more. Perfect for students, researchers, and lifelong learners.",
    primaryCTA: "Try SolomindLM",
    secondaryCTA: "See Features",
  },
  features: LANDING_TOOLS.map((tool) => ({
    id: tool.id,
    title: tool.label,
    description: getFeatureDescription(tool.id),
  })),
  contentShowcase: {
    title: "Upload Anything, Learn Everything",
    description:
      "Upload files, paste links, import papers, or pull from Google Drive—SolomindLM turns your sources into interactive study materials",
    formats: [
      { name: "PDFs", icon: "FileText" },
      { name: "Video Transcripts", icon: "Youtube" },
      { name: "Websites", icon: "Globe" },
      { name: "Docs & Slides", icon: "Presentation" },
      { name: "Images & Scans", icon: "ScanLine" },
      { name: "Audio Files", icon: "AudioLines" },
      { name: "Research Papers", icon: "GraduationCap" },
      { name: "Google Drive", icon: "HardDrive" },
      { name: "Text & Data", icon: "FileSpreadsheet" },
    ],
  },
  finalCTA: {
    title: "Ready to Transform Your Learning?",
    description: "Create study and research materials from your own sources",
    buttonText: "Get Started",
    trustBadge: "No credit card required",
  },
};

/** Marquee row 1 — interleaved mix (not source order). */
export const FEATURES_MARQUEE_ROW_1_ORDER = [
  "flashcards",
  "deepResearch",
  "audio",
  "quiz",
  "literatureReview",
  "mindmap",
  "chat",
  "infographic",
  "rag",
  "reports",
  "writtenQuestions",
  "spreadsheets",
] as const;

/** Marquee row 2 — different shuffle so rows don't mirror each other. */
export const FEATURES_MARQUEE_ROW_2_ORDER = [
  "quiz",
  "spreadsheets",
  "rag",
  "audio",
  "literatureReview",
  "flashcards",
  "deepResearch",
  "mindmap",
  "chat",
  "reports",
  "infographic",
  "writtenQuestions",
] as const;

export function orderLandingFeatures(
  features: typeof LANDING_CONTENT.features,
  order: readonly string[]
) {
  const byId = new Map(features.map((feature) => [feature.id, feature]));
  return order.flatMap((id) => {
    const feature = byId.get(id);
    return feature ? [feature] : [];
  });
}

function getFeatureDescription(id: string): string {
  const descriptions: Record<string, string> = {
    rag: "Answers from your uploaded sources",
    chat: "Ask questions using your notebook sources",
    deepResearch: "Multi-step research with web and notebook sources",
    literatureReview: "Screen papers and draft synthesis reports",
    sourceUpload: "Files, links, transcripts, and pasted text",
    sourceDiscovery: "Search web and news, add to your notebook",
    academicDiscovery: "Find academic papers with filters",
    paperImport: "DOI, BibTeX, RIS, Zotero, and Mendeley",
    citationStyles: "APA, MLA, Chicago, IEEE, and more",
    notebookSharing: "Cowork or fork a notebook via link",
    audio: "Audio recaps from your study material",
    mindmap: "Visual maps of concepts from your sources",
    reports: "Study guides and report drafts on demand",
    flashcards: "Flashcard drafts from your material",
    quiz: "Multiple-choice practice quizzes from sources",
    infographic: "Visual infographics from your sources",
    writtenQuestions: "Written prompts with answer feedback",
    spreadsheets: "Structured tables extracted from sources",
  };
  return descriptions[id] || "";
}
