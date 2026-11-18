import { STUDIO_TOOLS } from "@/shared/constants";

export interface FAQItem {
  question: string;
  answer: string;
}

export const LANDING_FAQS: FAQItem[] = [
  {
    question: "What types of content can I upload?",
    answer:
      "SolomindLM supports PDFs, images, audio files, web pages, YouTube videos, TikTok, Instagram, X (Twitter) posts, and Google Drive files. Our extraction pipeline uses Mistral OCR for documents and Supadata for social media transcripts.",
  },
  {
    question: "What can I generate from my content?",
    answer:
      "You can generate reports, flashcards, quizzes, mind maps, audio overviews, infographics, spreadsheets, and written questions with AI-powered grading. Each tool is designed to help you learn and retain information in different ways.",
  },
  {
    question: "How does the RAG chat work?",
    answer:
      "Ask questions about your uploaded sources and get answers with inline citations pointing to the exact passages in your documents. You can also enable deep research mode for iterative sub-question exploration, or augment responses with external web, academic, and news search.",
  },
  {
    question: "How accurate is the AI-generated content?",
    answer:
      "All generated content is grounded directly in your uploaded sources with inline citations, rather than relying solely on general knowledge. This dramatically reduces hallucinations and ensures flashcards, quizzes, and summaries accurately reflect your original materials.",
  },
  {
    question: "Can I export my study materials?",
    answer:
      "Yes. Flashcards and spreadsheets can be exported as CSV files. Reports can be downloaded as Markdown. Audio overviews can be saved as MP3 files.",
  },
  {
    question: "Can I share my notebooks with others?",
    answer:
      "Yes. Create collaborate links to let others edit your notebook in real time, or fork links so others can duplicate your work into their own account.",
  },
  {
    question: "Is there a limit on how much I can upload?",
    answer:
      "The free plan includes 20 notebooks per account with up to 20 sources per notebook. Pro plans offer 200 notebooks per account with up to 100 sources per notebook. Each plan also includes daily limits on AI-generated content. Check our pricing section for details.",
  },
  {
    question: "What languages are supported?",
    answer:
      "SolomindLM supports multiple languages for both chat and studio features. You can upload content in various languages and generate study materials in your preferred language.",
  },
  {
    question: "Is there a mobile app?",
    answer:
      "Not yet, but the web app is fully responsive and works great on mobile browsers. A native mobile app is on our roadmap.",
  },
  {
    question: "How is my data used and protected?",
    answer:
      "Your content is used only to run the product you see—search, chat, and generation—and is handled as described in our Privacy Policy. We use trusted infrastructure and AI providers as subprocessors; we don't sell your personal information.",
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
  { id: "deepResearch", label: "Deep Research", iconName: "Microscope", color: "text-indigo-600" },
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
      { name: "Images", icon: "Image" },
      { name: "Audio", icon: "AudioLines" },
      { name: "Websites", icon: "Globe" },
      { name: "YouTube Videos", icon: "Youtube" },
      { name: "Social Media", icon: "Share2" },
      { name: "Google Drive", icon: "HardDrive" },
      { name: "Text Files", icon: "File" },
      { name: "Handwritten Notes", icon: "File" },
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
    deepResearch: "Multi-step research with cited sources",
    spreadsheets: "Sources turned into tables and data",
  };
  return descriptions[id] || "";
}
