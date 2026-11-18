import React from "react";
import { useNavigate } from "react-router-dom";
import { ToolPage } from "../components/ToolPage";

const FEATURES = [
  "Upload any study material",
  "AI generates multiple-choice questions",
  "Detailed explanations for each answer",
  "Adjustable difficulty levels",
  "Topic-specific quizzes",
  "Track your progress",
  "Review incorrect answers",
  "Export quizzes as PDF",
];

const HOW_IT_WORKS = [
  {
    title: "Upload Content",
    description: "Upload your study materials—PDFs, notes, textbook chapters, or articles.",
  },
  {
    title: "AI Question Generation",
    description: "Our AI analyzes your content and creates relevant multiple-choice questions with correct answers and explanations.",
  },
  {
    title: "Customize Your Quiz",
    description: "Adjust the number of questions, difficulty level, and topics you want to focus on.",
  },
  {
    title: "Test Your Knowledge",
    description: "Take the quiz, review your answers, and see detailed explanations for each question.",
  },
];

const FAQS = [
  {
    question: "How many questions can I generate?",
    answer: "You can generate up to 50 questions per quiz on the free plan. Pro users can generate unlimited questions.",
  },
  {
    question: "Can I choose the difficulty level?",
    answer: "Yes, you can set the difficulty to beginner, intermediate, or advanced. The AI will adjust question complexity accordingly.",
  },
  {
    question: "Are the questions accurate?",
    answer: "Yes, our RAG-based AI ensures all questions and answers are grounded in your uploaded content, not hallucinated.",
  },
  {
    question: "Can I share quizzes with classmates?",
    answer: "Yes, you can share quizzes via link or export them as PDF for offline use.",
  },
];

export const AIQuizGenerator: React.FC = () => {
  const navigate = useNavigate();

  return (
    <ToolPage
      title="Free AI Quiz Generator | Create Quizzes from Any Content"
      description="Generate AI quizzes with detailed explanations from your study materials. Upload PDFs, notes, or text and get test-ready questions instantly."
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
            Quiz
          </span>{" "}
          Generator
        </>
      }
      subheadline="Create comprehensive quizzes with detailed explanations from any study material"
      answerFirst="SolomindLM's AI Quiz Generator creates comprehensive multiple-choice quizzes from any study material. Upload your PDFs, lecture notes, or textbook chapters, and our AI will generate relevant questions with detailed explanations for each answer. Unlike generic quiz makers, SolomindLM's questions are grounded in your specific content using RAG technology, ensuring accuracy and relevance. Perfect for exam preparation, self-testing, and classroom assessments."
      features={FEATURES}
      howItWorks={HOW_IT_WORKS}
      faqs={FAQS}
      canonical="/tools/ai-quiz-generator"
      onGetStarted={() => navigate("/home")}
    />
  );
};
