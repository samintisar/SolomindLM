import { STUDIO_TOOLS } from '@/shared/constants';

export const LANDING_CONTENT = {
  hero: {
    headline: "Transform How You Learn with AI",
    subheadline: "Upload any content—PDFs, videos, articles—and generate flashcards, quizzes, mind maps, and more. Perfect for students, researchers, and lifelong learners.",
    primaryCTA: "Try SolomindLM",
    secondaryCTA: "See Features"
  },
  features: STUDIO_TOOLS.map(tool => ({
    id: tool.id,
    title: tool.label,
    description: getFeatureDescription(tool.id)
  })),
  contentShowcase: {
    title: "Upload Anything, Learn Everything",
    description: "SolomindLM accepts virtually any content type and transforms it into interactive study materials",
    formats: [
      { name: "PDFs", icon: "FileText" },
      { name: "Social Media Videos", icon: "Youtube" },
      { name: "Websites", icon: "Globe" },
      { name: "Slides", icon: "FileCode" },
      { name: "Handwritten Notes", icon: "File" },
      { name: "Text Files", icon: "File" }
    ]
  },
  howItWorks: {
    title: "How It Works",
    steps: [
      {
        number: 1,
        title: "Upload Content",
        description: "Drag and drop PDFs, paste URLs, or record audio",
        icon: "Upload"
      },
      {
        number: 2,
        title: "Generate Study Tools",
        description: "AI automatically creates flashcards, quizzes, and more",
        icon: "Wand2"
      },
      {
        number: 3,
        title: "Learn & Retain",
        description: "Study with interactive tools and track your progress",
        icon: "GraduationCap"
      }
    ]
  },
  finalCTA: {
    title: "Ready to Transform Your Learning?",
    description: "Join thousands of students and researchers using SolomindLM",
    buttonText: "Get Started Free",
    trustBadge: "No credit card required"
  }
};

function getFeatureDescription(id: string): string {
  const descriptions: Record<string, string> = {
    audio: "Listen to AI-generated summaries on the go",
    mindmap: "Visualize connections and concepts with interactive mind maps",
    reports: "Get comprehensive study guides and detailed reports",
    flashcards: "Generate flashcards automatically from any content",
    quiz: "Test your knowledge with AI-generated quizzes",
    writtenQuestions: "Practice with written questions and detailed feedback",
    rag: "AI answers grounded in your sources for accurate, source-based learning"
  };
  return descriptions[id] || "";
}
