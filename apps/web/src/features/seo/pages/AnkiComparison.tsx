import React from "react";
import { useNavigate } from "react-router-dom";
import { ComparisonPage } from "../components/ComparisonPage";

const ANKI_FEATURES = [
  { feature: "AI Content Generation", solomindlm: true, competitor: false },
  { feature: "Automatic Flashcard Creation", solomindlm: true, competitor: false },
  { feature: "Quiz Generation", solomindlm: true, competitor: false },
  { feature: "Mind Map Creation", solomindlm: true, competitor: false },
  { feature: "Infographic Generation", solomindlm: true, competitor: false },
  { feature: "Audio Overviews", solomindlm: true, competitor: "Plugins only" },
  { feature: "Spaced Repetition", solomindlm: "Coming soon", competitor: true },
  { feature: "PDF Import", solomindlm: true, competitor: "Complex" },
  { feature: "YouTube Integration", solomindlm: true, competitor: false },
  { feature: "RAG Chat", solomindlm: true, competitor: false },
  { feature: "Mobile App", solomindlm: true, competitor: true },
  { feature: "Ease of Use", solomindlm: "Beginner-friendly", competitor: "Steep learning curve" },
  { feature: "Pricing", solomindlm: "Free + $7.50/mo Pro", competitor: "Free (iOS $25)" },
];

const ANKI_FAQS = [
  {
    question: "Is SolomindLM a replacement for Anki?",
    answer:
      "SolomindLM complements Anki by automating flashcard creation. While Anki excels at spaced repetition scheduling, SolomindLM generates the flashcards automatically from your content. Many users use both: SolomindLM to create cards, Anki to review them.",
  },
  {
    question: "Does SolomindLM have spaced repetition like Anki?",
    answer:
      "Spaced repetition is coming soon to SolomindLM. Currently, SolomindLM focuses on AI-powered content generation while Anki specializes in review scheduling.",
  },
  {
    question: "Which is easier to use for beginners?",
    answer:
      "SolomindLM is much more beginner-friendly. Anki has a steep learning curve with complex card templates and scheduling options. SolomindLM works immediately—just upload content and get study materials.",
  },
  {
    question: "Can I export SolomindLM flashcards to Anki?",
    answer:
      "Export to Anki format is on our roadmap. Currently, you can export flashcards as CSV or PDF for manual import.",
  },
];

export const AnkiComparison: React.FC = () => {
  const navigate = useNavigate();

  return (
    <ComparisonPage
      title="SolomindLM vs Anki: AI Flashcards vs Traditional SRS"
      description="Compare SolomindLM and Anki. SolomindLM uses AI to automatically create flashcards from your content, while Anki requires manual creation but offers advanced spaced repetition."
      competitorName="Anki"
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
            Anki
          </span>
        </>
      }
      subheadline="AI-powered flashcard generation vs traditional spaced repetition"
      answerFirst="SolomindLM is the best alternative to Anki for users who want automated flashcard creation. While Anki requires you to manually create each card and has a steep learning curve, SolomindLM generates complete flashcard decks from your PDFs, notes, and videos in seconds. SolomindLM also creates quizzes, mind maps, and study guides—giving you multiple ways to learn the same material."
      features={ANKI_FEATURES}
      faqs={ANKI_FAQS}
      canonical="/vs/anki"
      onGetStarted={() => navigate("/home")}
    />
  );
};
