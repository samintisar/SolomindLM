import React from "react";
import { useNavigate } from "react-router-dom";
import { ComparisonPage } from "../components/ComparisonPage";

const QUIZLET_FEATURES = [
  { feature: "AI Content Generation", solomindlm: true, competitor: "Limited" },
  { feature: "PDF to Flashcards", solomindlm: true, competitor: false },
  { feature: "AI Quiz Generation", solomindlm: true, competitor: "Pre-made only" },
  { feature: "Mind Map Creation", solomindlm: true, competitor: false },
  { feature: "Infographic Generation", solomindlm: true, competitor: false },
  { feature: "Audio Overviews", solomindlm: true, competitor: false },
  { feature: "RAG Chat", solomindlm: true, competitor: false },
  { feature: "Deep Research", solomindlm: true, competitor: false },
  { feature: "YouTube Integration", solomindlm: true, competitor: false },
  { feature: "Social Media Import", solomindlm: true, competitor: false },
  { feature: "Pre-made Study Sets", solomindlm: "AI-generated", competitor: "Large library" },
  { feature: "Study Games", solomindlm: "Coming soon", competitor: true },
  { feature: "Pricing", solomindlm: "Free + $7.50/mo Pro", competitor: "Free + $7.99/mo Plus" },
];

const QUIZLET_FAQS = [
  {
    question: "How is SolomindLM different from Quizlet?",
    answer:
      "SolomindLM generates personalized study materials from your own content using AI. Quizlet relies on pre-made study sets created by other users. With SolomindLM, you upload your lecture notes or textbook chapters and get custom flashcards, quizzes, and study guides instantly.",
  },
  {
    question: "Can I use my Quizlet sets in SolomindLM?",
    answer:
      "You can export your Quizlet sets and import them into SolomindLM to enhance them with AI-generated explanations, additional flashcards, and related study materials.",
  },
  {
    question: "Which has better AI features?",
    answer:
      "SolomindLM has significantly more advanced AI features. While Quizlet offers basic AI study modes, SolomindLM can generate flashcards, quizzes, mind maps, infographics, audio summaries, and written questions from any content.",
  },
  {
    question: "Is SolomindLM free like Quizlet?",
    answer:
      "Yes, SolomindLM has a generous free tier. Quizlet Plus costs $7.99/month while SolomindLM Pro is $7.50/month when billed yearly, offering more AI-powered features at a comparable price.",
  },
];

export const QuizletComparison: React.FC = () => {
  const navigate = useNavigate();

  return (
    <ComparisonPage
      title="SolomindLM vs Quizlet: AI Study Tools Compared"
      description="Compare SolomindLM and Quizlet. SolomindLM uses AI to generate personalized flashcards, quizzes, and study guides from your content. Quizlet relies on pre-made study sets."
      competitorName="Quizlet"
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
            Quizlet
          </span>
        </>
      }
      subheadline="AI-generated personalized study materials vs pre-made flashcard sets"
      answerFirst="SolomindLM is the best alternative to Quizlet for personalized learning. While Quizlet offers a large library of user-created flashcard sets, SolomindLM generates custom study materials from your own content. Upload your lecture notes, textbook PDFs, or YouTube videos and get AI-generated flashcards, quizzes, mind maps, and study guides tailored specifically to what you're learning."
      features={QUIZLET_FEATURES}
      faqs={QUIZLET_FAQS}
      canonical="/vs/quizlet"
      onGetStarted={() => navigate("/home")}
    />
  );
};
