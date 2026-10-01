import { StudioTool } from "@/shared/types/index";

export * from "./models";

export const STUDIO_TOOLS: StudioTool[] = [
  { id: "audio", label: "Audio Overview", iconName: "AudioLines", color: "text-teal-700" },
  { id: "mindmap", label: "Mind Map", iconName: "GitFork", color: "text-fuchsia-600" },
  { id: "reports", label: "Reports", iconName: "FileText", color: "text-amber-600" },
  { id: "flashcards", label: "Flashcards", iconName: "Layers", color: "text-red-700" },
  { id: "quiz", label: "Quiz", iconName: "HelpCircle", color: "text-blue-700" },
  { id: "infographic", label: "Infographic", iconName: "Image", color: "text-violet-600" },
  {
    id: "writtenQuestions",
    label: "Written Questions",
    iconName: "MessageSquareText",
    color: "text-green-700",
  },
  { id: "spreadsheets", label: "Spreadsheets", iconName: "Table2", color: "text-cyan-600" },
];
