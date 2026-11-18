import React from "react";
import { useNavigate } from "react-router-dom";
import { ToolPage } from "../components/ToolPage";

const FEATURES = [
  "Upload any PDF, document, or text",
  "AI extracts key concepts automatically",
  "Generates question-answer pairs",
  "Supports multiple flashcard formats",
  "Add images and rich media",
  "Export to multiple formats",
  "Study with built-in review mode",
  "AI-enhanced explanations",
];

const HOW_IT_WORKS = [
  {
    title: "Upload Your Content",
    description: "Upload PDFs, Word documents, images of notes, or paste text directly. Our AI supports all major formats.",
  },
  {
    title: "AI Analysis",
    description: "Our AI reads and understands your content, identifying key concepts, definitions, and important facts.",
  },
  {
    title: "Generate Flashcards",
    description: "The AI creates question-answer flashcard pairs automatically. Review and edit them as needed.",
  },
  {
    title: "Study & Learn",
    description: "Use the generated flashcards to study. Add them to your notebooks and review anytime.",
  },
];

const FAQS = [
  {
    question: "What file formats can I upload?",
    answer: "You can upload PDFs, Word documents, images (JPG, PNG), and paste plain text. We also support importing from Google Drive and YouTube videos.",
  },
  {
    question: "How accurate are the AI-generated flashcards?",
    answer: "Our AI uses RAG (Retrieval-Augmented Generation) to ensure accuracy. The flashcards are grounded in your uploaded content, minimizing hallucinations. You can always edit them before studying.",
  },
  {
    question: "Can I export the flashcards?",
    answer: "Yes, you can export flashcards as PDF, CSV, or print them. Anki export is coming soon.",
  },
  {
    question: "Is there a limit to how many flashcards I can generate?",
    answer: "Free users get generous monthly limits. Pro users ($7.50/mo) get unlimited AI generation.",
  },
];

export const AIFlashcardGenerator: React.FC = () => {
  const navigate = useNavigate();

  return (
    <ToolPage
      title="Free AI Flashcard Generator | Create Flashcards from Any Content"
      description="Generate AI flashcards from PDFs, documents, and notes instantly. Upload your content and get study-ready flashcards in seconds."
      headline={
        <>
          AI{" "}
          <span
            style={{
              background: "linear-gradient(135deg, #f97316 0%, #fbbf24 50%, #fb7185 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Flashcard
          </span>{" "}
          Generator
        </>
      }
      subheadline="Transform any PDF, document, or notes into study-ready flashcards with AI"
      answerFirst="SolomindLM's AI Flashcard Generator is the fastest way to create study flashcards from any content. Upload your PDFs, lecture notes, textbook chapters, or paste text, and our AI will automatically generate question-answer flashcard pairs. Unlike manual flashcard creation which takes hours, SolomindLM generates comprehensive flashcard decks in seconds—complete with AI-enhanced explanations and the ability to add images and rich media."
      features={FEATURES}
      howItWorks={HOW_IT_WORKS}
      faqs={FAQS}
      canonical="/tools/ai-flashcard-generator"
      onGetStarted={() => navigate("/home")}
    />
  );
};
