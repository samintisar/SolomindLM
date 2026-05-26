import { STUDIO_TOOLS } from "@/shared/constants";

export interface FAQItem {
  question: string;
  answer: string;
}

export const LANDING_FAQS: FAQItem[] = [
  {
    question: "How accurate is the AI-generated content?",
    answer:
      "All generated content is grounded directly in your uploaded sources—whether it's a PDF, article, or video—rather than relying solely on general knowledge. This means the chances of AI hallucinations are extremely low, ensuring the flashcards, quizzes, and summaries accurately reflect your original materials.",
  },
  {
    question: "What languages are supported?",
    answer:
      "Currently, we're focusing on English content with full official support. We're actively working on expanding to other popular languages including Spanish, French, German, Chinese, Japanese, and Korean. Coming soon, you'll be able to process content in one language and generate study materials in another.",
  },
  {
    question: "Can I export my flashcards and study materials?",
    answer:
      "Yes! You can export your flashcards to Anki, Quizlet, as CSV files. Mind maps can be exported as images or in Markdown format. Audio overviews can be downloaded as MP3 files.",
  },
  {
    question: "How is my data used and protected?",
    answer:
      "Your content is used to run the product you see—search, chat, and generation—and is handled as described in our Privacy Policy. We use trusted infrastructure and AI providers as subprocessors; we don't sell your personal information. The policy also covers analytics and email-based sign-in.",
  },
  {
    question: "Is there a limit on how much I can upload?",
    answer:
      "The free plan includes 20 notebooks per account with up to 200 sources per notebook. Pro plans offer 200 notebooks per account with up to 200 sources per notebook. Each plan also includes daily limits on AI-generated content. Check our pricing section for details.",
  },
  {
    question: "What makes SolomindLM different from Quizlet or Anki?",
    answer:
      "Unlike Quizlet or Anki which require manual content creation, SolomindLM uses AI to automatically generate study materials from any content source. Simply upload a PDF, video, or article, and get flashcards, quizzes, and mind maps instantly—saving you hours of manual work.",
  },
  {
    question: "How long does it take to generate study materials?",
    answer:
      "Most documents are processed in under 60 seconds. A 20-page PDF typically takes about 30 seconds to generate comprehensive flashcards, quizzes, and summaries.",
  },
];

const LANDING_TOOLS = [
  { id: "rag", label: "Grounded RAG System", iconName: "Brain", color: "text-violet-600" },
  ...STUDIO_TOOLS,
];

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
      "SolomindLM accepts virtually any content type and transforms it into interactive study materials",
    formats: [
      { name: "PDFs", icon: "FileText" },
      { name: "Youtube Videos", icon: "Youtube" },
      { name: "Websites", icon: "Globe" },
      { name: "Slides", icon: "FileCode" },
      { name: "Handwritten Notes", icon: "File" },
      { name: "Text Files", icon: "File" },
    ],
  },
  finalCTA: {
    title: "Ready to Transform Your Learning?",
    description: "Join thousands of students and researchers using SolomindLM",
    buttonText: "Get Started Free",
    trustBadge: "No credit card required",
  },
};

function getFeatureDescription(id: string): string {
  const descriptions: Record<string, string> = {
    audio: "AI summaries you can listen to anywhere",
    mindmap: "Map concepts and connections visually",
    reports: "Study guides and reports, on demand",
    flashcards: "Auto-generated cards from any content",
    quiz: "Test yourself with AI-built quizzes",
    infographic: "Visual infographics from your sources",
    writtenQuestions: "Written Q&A with instant feedback",
    rag: "Answers grounded in your sources",
    spreadsheets: "Sources turned into tables and data",
  };
  return descriptions[id] || "";
}
