import type { LucideIcon } from "lucide-react";
import {
  AudioLines,
  BookOpen,
  CircleHelp,
  FileInput,
  FileText,
  GitFork,
  Globe,
  GraduationCap,
  Image as ImageIcon,
  Layers,
  MessageCircle,
  MessageSquareText,
  Quote,
  Share2,
  Table2,
  Telescope,
  Upload,
} from "lucide-react";
import type { Tone } from "./components/home/tone";

export interface IntentTool {
  icon: LucideIcon;
  tone: Tone;
}

/** The icon and Studio tone each tool page shows on cards and in its scene (same as the home Studio tiles). */
const INTENT_TOOLS: Record<string, IntentTool> = {
  sourceUpload: { icon: Upload, tone: "book" },
  sourceDiscovery: { icon: Globe, tone: "web" },
  notebookSharing: { icon: Share2, tone: "share" },
  flashcards: { icon: Layers, tone: "flashcard" },
  quiz: { icon: CircleHelp, tone: "quiz" },
  audio: { icon: AudioLines, tone: "audio" },
  mindmap: { icon: GitFork, tone: "mindmap" },
  reports: { icon: FileText, tone: "report" },
  infographic: { icon: ImageIcon, tone: "infographic" },
  writtenQuestions: { icon: MessageSquareText, tone: "written" },
  spreadsheets: { icon: Table2, tone: "spreadsheet" },
  academicDiscovery: { icon: GraduationCap, tone: "book" },
  paperImport: { icon: FileInput, tone: "pdf" },
  citationStyles: { icon: Quote, tone: "literature" },
  literatureReview: { icon: BookOpen, tone: "literature" },
  chat: { icon: MessageCircle, tone: "chat" },
  deepResearch: { icon: Telescope, tone: "research" },
};

export function getIntentTool(intentKey: string): IntentTool | undefined {
  return INTENT_TOOLS[intentKey];
}
