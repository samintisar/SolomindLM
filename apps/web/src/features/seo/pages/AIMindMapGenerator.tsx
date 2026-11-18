import React from "react";
import { useNavigate } from "react-router-dom";
import { ToolPage } from "../components/ToolPage";

const FEATURES = [
  "Upload any content or topic",
  "AI identifies key concepts and relationships",
  "Generates visual mind maps",
  "Interactive and editable",
  "Color-coded by topic",
  "Add custom nodes and connections",
  "Export as image or PDF",
  "Collaborate with study groups",
];

const HOW_IT_WORKS = [
  {
    title: "Input Your Topic",
    description: "Upload a document, paste text, or simply enter a topic you want to visualize.",
  },
  {
    title: "AI Analysis",
    description: "Our AI identifies key concepts, subtopics, and relationships between ideas.",
  },
  {
    title: "Mind Map Generation",
    description: "The AI creates a visual mind map with the main topic at the center and related concepts branching out.",
  },
  {
    title: "Customize and Explore",
    description: "Edit the mind map, add new nodes, rearrange connections, and export for your notes.",
  },
];

const FAQS = [
  {
    question: "What can I create mind maps from?",
    answer: "You can create mind maps from PDFs, documents, notes, or just by entering a topic. The AI will research and visualize the concept map.",
  },
  {
    question: "Are the mind maps interactive?",
    answer: "Yes! You can drag nodes, add new connections, change colors, and customize the layout however you prefer.",
  },
  {
    question: "Can I export the mind maps?",
    answer: "Yes, you can export as PNG, PDF, or even as an interactive file that others can view and edit.",
  },
  {
    question: "How detailed are the generated mind maps?",
    answer: "The AI creates comprehensive mind maps with 2-3 levels of depth. You can expand further by adding your own nodes and connections.",
  },
];

export const AIMindMapGenerator: React.FC = () => {
  const navigate = useNavigate();

  return (
    <ToolPage
      title="Free AI Mind Map Generator | Visualize Any Topic or Content"
      description="Generate interactive mind maps from any content or topic using AI. Upload documents or enter topics and get visual concept maps instantly."
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
            Mind Map
          </span>{" "}
          Generator
        </>
      }
      subheadline="Transform any topic or document into interactive visual mind maps"
      answerFirst="SolomindLM's AI Mind Map Generator creates visual concept maps from any topic or document. Upload a PDF, paste text, or simply enter a subject, and our AI will identify key concepts, relationships, and hierarchies—then visualize them as an interactive mind map. Unlike static diagrams, SolomindLM's mind maps are fully editable: add nodes, rearrange connections, and customize colors to match your learning style. Perfect for visual learners, brainstorming, and understanding complex topics."
      features={FEATURES}
      howItWorks={HOW_IT_WORKS}
      faqs={FAQS}
      canonical="/tools/ai-mind-map-generator"
      onGetStarted={() => navigate("/home")}
    />
  );
};
