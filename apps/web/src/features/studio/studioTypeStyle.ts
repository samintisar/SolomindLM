import {
  AudioLines,
  BookOpen,
  FileText,
  GitFork,
  HelpCircle,
  Image,
  Layers,
  type LucideIcon,
  MessageSquareText,
  Table2,
} from "lucide-react";
import { isReportNote, type Note } from "@/shared/types/index";
import { isLiteratureReviewReportType } from "@/shared/types/reportTypes";

type StudioTypeKey =
  | "audio"
  | "mindmap"
  | "report"
  | "flashcard"
  | "quiz"
  | "infographic"
  | "written"
  | "spreadsheet"
  | "note"
  | "literature";

interface StudioTypeStyle {
  icon: LucideIcon;
  /** Tile fill and icon colour. */
  tileClass: string;
  /** Sets --studio-tone for decorations such as the generating Sheen. Empty means primary. */
  toneClass: string;
}

// Literal class strings so Tailwind generates them.
const STYLES: Record<StudioTypeKey, StudioTypeStyle> = {
  audio: {
    icon: AudioLines,
    tileClass: "bg-studio-audio/10 text-studio-audio",
    toneClass: "studio-tone-audio",
  },
  mindmap: {
    icon: GitFork,
    tileClass: "bg-studio-mindmap/10 text-studio-mindmap",
    toneClass: "studio-tone-mindmap",
  },
  report: {
    icon: FileText,
    tileClass: "bg-studio-report/10 text-studio-report",
    toneClass: "studio-tone-report",
  },
  flashcard: {
    icon: Layers,
    tileClass: "bg-studio-flashcard/10 text-studio-flashcard",
    toneClass: "studio-tone-flashcard",
  },
  quiz: {
    icon: HelpCircle,
    tileClass: "bg-studio-quiz/10 text-studio-quiz",
    toneClass: "studio-tone-quiz",
  },
  infographic: {
    icon: Image,
    tileClass: "bg-studio-infographic/10 text-studio-infographic",
    toneClass: "studio-tone-infographic",
  },
  written: {
    icon: MessageSquareText,
    tileClass: "bg-studio-written/10 text-studio-written",
    toneClass: "studio-tone-written",
  },
  spreadsheet: {
    icon: Table2,
    tileClass: "bg-studio-spreadsheet/10 text-studio-spreadsheet",
    toneClass: "studio-tone-spreadsheet",
  },
  note: {
    icon: FileText,
    tileClass: "bg-studio-note/10 text-studio-note",
    toneClass: "studio-tone-note",
  },
  literature: {
    icon: BookOpen,
    tileClass: "bg-studio-literature/10 text-studio-literature",
    toneClass: "studio-tone-literature",
  },
};

const FALLBACK: StudioTypeStyle = {
  icon: FileText,
  tileClass: "bg-muted text-muted-foreground",
  toneClass: "",
};

const NOTE_TYPE_KEY: Record<Note["type"], StudioTypeKey | null> = {
  audio: "audio",
  audioOverview: "audio",
  flashcard: "flashcard",
  report: "report",
  quiz: "quiz",
  mindmap: "mindmap",
  writtenQuestions: "written",
  infographic: "infographic",
  spreadsheet: "spreadsheet",
  note: "note",
  text: null,
};

/** Icon and colour classes for a Studio note's type (Saved list tiles, generating Sheen). */
export function studioTypeStyle(note: Note): StudioTypeStyle {
  const key =
    isReportNote(note) && isLiteratureReviewReportType(note.metadata.reportType)
      ? "literature"
      : NOTE_TYPE_KEY[note.type];
  return key ? STYLES[key] : FALLBACK;
}
