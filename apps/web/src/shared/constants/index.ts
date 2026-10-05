import { StudioTool } from "@/shared/types/index";

export * from "./models";

export const STUDIO_TOOLS: StudioTool[] = [
  { id: "audio", label: "Audio Overview", iconName: "AudioLines", color: "text-studio-audio" },
  { id: "mindmap", label: "Mind Map", iconName: "GitFork", color: "text-studio-mindmap" },
  { id: "reports", label: "Reports", iconName: "FileText", color: "text-studio-report" },
  { id: "flashcards", label: "Flashcards", iconName: "Layers", color: "text-studio-flashcard" },
  { id: "quiz", label: "Quiz", iconName: "HelpCircle", color: "text-studio-quiz" },
  { id: "infographic", label: "Infographic", iconName: "Image", color: "text-studio-infographic" },
  {
    id: "writtenQuestions",
    label: "Written Questions",
    iconName: "MessageSquareText",
    color: "text-studio-written",
  },
  {
    id: "spreadsheets",
    label: "Spreadsheets",
    iconName: "Table2",
    color: "text-studio-spreadsheet",
  },
];
