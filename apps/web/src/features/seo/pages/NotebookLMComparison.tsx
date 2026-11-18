import React from "react";
import { useNavigate } from "react-router-dom";
import { ComparisonPage } from "../components/ComparisonPage";

const NOTEBOOKLM_FEATURES = [
  { feature: "AI Flashcard Generation", solomindlm: true, competitor: "Limited" },
  { feature: "AI Quiz Generation", solomindlm: true, competitor: "Limited" },
  { feature: "Mind Map Creation", solomindlm: true, competitor: false },
  { feature: "Infographic Generation", solomindlm: true, competitor: false },
  { feature: "Audio Overviews", solomindlm: true, competitor: true },
  { feature: "Spreadsheets/Tables", solomindlm: true, competitor: false },
  { feature: "Written Questions", solomindlm: true, competitor: false },
  { feature: "RAG Chat with Sources", solomindlm: true, competitor: true },
  { feature: "Deep Research", solomindlm: true, competitor: true },
  { feature: "Social Media Import", solomindlm: true, competitor: false },
  { feature: "YouTube Transcripts", solomindlm: true, competitor: "Basic" },
  { feature: "Export Options", solomindlm: "Multiple formats", competitor: "Limited" },
  { feature: "Pricing", solomindlm: "Free + $7.50/mo Pro", competitor: "Free" },
];

const NOTEBOOKLM_FAQS = [
  {
    question: "What makes SolomindLM different from NotebookLM?",
    answer:
      "SolomindLM offers more study material types including flashcards, quizzes, mind maps, and infographics. While NotebookLM focuses on document analysis and audio summaries, SolomindLM is built specifically for active learning with interactive study tools.",
  },
  {
    question: "Can I import my NotebookLM notebooks into SolomindLM?",
    answer:
      "Yes, you can upload your existing documents, PDFs, and notes to SolomindLM and generate enhanced study materials including flashcards, quizzes, and mind maps from the same content.",
  },
  {
    question: "Which tool is better for students?",
    answer:
      "SolomindLM is designed specifically for students with interactive study tools like flashcards and quizzes that help with active recall. NotebookLM is better suited for research and document analysis.",
  },
  {
    question: "Does SolomindLM support audio like NotebookLM?",
    answer:
      "Yes, SolomindLM generates audio overviews and podcast-style summaries from your study materials, similar to NotebookLM's audio features.",
  },
];

export const NotebookLMComparison: React.FC = () => {
  const navigate = useNavigate();

  return (
    <ComparisonPage
      title="SolomindLM vs NotebookLM: Which AI Learning Tool is Better?"
      description="Compare SolomindLM and NotebookLM. SolomindLM offers more study tools including flashcards, quizzes, mind maps, and infographics for active learning."
      competitorName="NotebookLM"
      headline={
        <>
          SolomindLM vs{" "}
          <span
            style={{
              background: "linear-gradient(135deg, #f97316 0%, #fbbf24 50%, #fb7185 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            NotebookLM
          </span>
        </>
      }
      subheadline="The most comprehensive AI learning platform vs Google's research assistant"
      answerFirst="SolomindLM is the best alternative to NotebookLM for students and active learners. While NotebookLM excels at document analysis and generating audio summaries, SolomindLM goes further by transforming your content into interactive study materials including flashcards, quizzes, mind maps, infographics, and more. If your goal is to actually learn and retain information—not just organize it—SolomindLM provides the tools for active learning."
      features={NOTEBOOKLM_FEATURES}
      faqs={NOTEBOOKLM_FAQS}
      canonical="/vs/notebooklm"
      onGetStarted={() => navigate("/home")}
    />
  );
};
