import React from "react";
import { useNavigate } from "react-router-dom";
import { ToolPage } from "../components/ToolPage";

const FEATURES = [
  "Upload PDFs, docs, or paste text",
  "AI extracts key topics and subtopics",
  "Generates structured study guides",
  "Includes summaries and key points",
  "Organized by chapters or sections",
  "Add custom notes and highlights",
  "Export as PDF or print",
  "Share with study groups",
];

const HOW_IT_WORKS = [
  {
    title: "Upload Your Material",
    description: "Upload textbooks, lecture notes, research papers, or any study material.",
  },
  {
    title: "AI Processing",
    description: "Our AI identifies main topics, subtopics, key concepts, and important details.",
  },
  {
    title: "Study Guide Creation",
    description: "The AI organizes everything into a structured study guide with summaries, key points, and definitions.",
  },
  {
    title: "Review and Customize",
    description: "Edit the study guide, add your own notes, highlight important sections, and export for offline study.",
  },
];

const FAQS = [
  {
    question: "How long does it take to generate a study guide?",
    answer: "Most study guides are generated within 30-60 seconds, depending on the length and complexity of your content.",
  },
  {
    question: "Can I edit the generated study guide?",
    answer: "Absolutely! You can edit, add notes, highlight sections, and reorganize the content however you prefer.",
  },
  {
    question: "What types of content work best?",
    answer: "Textbooks, lecture notes, research papers, articles, and any structured educational content work best.",
  },
  {
    question: "Can I create study guides from multiple sources?",
    answer: "Yes, you can upload multiple documents and the AI will create a unified study guide combining all sources.",
  },
];

export const AIStudyGuideCreator: React.FC = () => {
  const navigate = useNavigate();

  return (
    <ToolPage
      title="Free AI Study Guide Creator | Generate Guides from Any Content"
      description="Create comprehensive AI study guides from PDFs, lecture notes, and textbooks. Upload your content and get structured study materials instantly."
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
            Study Guide
          </span>{" "}
          Creator
        </>
      }
      subheadline="Transform textbooks, lecture notes, and documents into structured study guides"
      answerFirst="SolomindLM's AI Study Guide Creator automatically transforms your textbooks, lecture notes, and documents into comprehensive, structured study guides. Unlike simply summarizing, our AI organizes content by topics and subtopics, extracts key concepts and definitions, and creates a logical flow that makes studying more efficient. Upload a 300-page textbook and get a focused study guide highlighting exactly what you need to know."
      features={FEATURES}
      howItWorks={HOW_IT_WORKS}
      faqs={FAQS}
      canonical="/tools/ai-study-guide-creator"
      onGetStarted={() => navigate("/home")}
    />
  );
};
