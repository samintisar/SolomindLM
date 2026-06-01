import {
  AudioLines,
  FileText,
  GitFork,
  HelpCircle,
  Image,
  Layers,
  Loader2,
  MessageSquareText,
  Table2,
} from "lucide-react";
import React from "react";
import { Note } from "@/shared/types/index";

interface NoteIconProps {
  note: Note;
}

/**
 * NoteIcon component renders type-specific icons for notes.
 * Matches Create tool grid styling (see STUDIO_TOOLS). Playback is handled on the row (NoteItem).
 */
export const NoteIcon: React.FC<NoteIconProps> = ({ note }) => {
  // Generating state with spinner
  if (note.status === "generating") {
    return (
      <div className="shrink-0 w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
        <Loader2 className="w-4 h-4 text-primary animate-spin" />
      </div>
    );
  }

  // Type-specific icons
  const iconConfig: Record<
    string,
    { icon: React.FC<{ className?: string }>; bgClass: string; textClass: string }
  > = {
    audioOverview: {
      icon: AudioLines,
      bgClass: "bg-teal-500/10",
      textClass: "text-teal-700 dark:text-teal-400",
    },
    audio: {
      icon: AudioLines,
      bgClass: "bg-teal-500/10",
      textClass: "text-teal-700 dark:text-teal-400",
    },
    flashcard: { icon: Layers, bgClass: "bg-red-500/10", textClass: "text-red-700" },
    report: { icon: FileText, bgClass: "bg-amber-500/10", textClass: "text-amber-600" },
    quiz: { icon: HelpCircle, bgClass: "bg-blue-500/10", textClass: "text-blue-700" },
    mindmap: { icon: GitFork, bgClass: "bg-fuchsia-500/10", textClass: "text-fuchsia-600" },
    writtenQuestions: {
      icon: MessageSquareText,
      bgClass: "bg-green-500/10",
      textClass: "text-green-700",
    },
    infographic: { icon: Image, bgClass: "bg-violet-500/10", textClass: "text-violet-600" },
    spreadsheet: { icon: Table2, bgClass: "bg-cyan-500/10", textClass: "text-cyan-600" },
    note: { icon: FileText, bgClass: "bg-indigo-500/10", textClass: "text-indigo-600" },
  };

  const config = iconConfig[note.type];
  if (config) {
    const Icon = config.icon;
    return (
      <div
        className={`shrink-0 w-8 h-8 rounded-lg ${config.bgClass} ${config.textClass} flex items-center justify-center`}
      >
        <Icon className="w-4 h-4 shrink-0" />
      </div>
    );
  }

  // Default icon
  return (
    <div className="shrink-0 w-8 h-8 rounded-lg bg-gray-500/10 text-gray-600 flex items-center justify-center">
      <FileText className="w-4 h-4 shrink-0" />
    </div>
  );
};
