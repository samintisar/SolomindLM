import React from "react";
import {
  Loader2,
  Play,
  Layers,
  FileText,
  HelpCircle,
  GitFork,
  MessageSquareText,
  Presentation,
  Table2,
} from "lucide-react";
import { Note, isAudioNote, isAudioOverviewNote } from "@/shared/types/index";

interface NoteIconProps {
  note: Note;
  onPlayAudio?: (note: Note) => void;
}

/**
 * NoteIcon component renders type-specific icons for notes.
 * Handles loading states and play buttons for audio notes.
 */
export const NoteIcon: React.FC<NoteIconProps> = ({ note, onPlayAudio }) => {
  // Generating state with spinner
  if (note.status === "generating") {
    return (
      <div className="shrink-0 w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
        <Loader2 className="w-4 h-4 text-primary animate-spin" />
      </div>
    );
  }

  // Audio overview (studio) — same shape as legacy audio note but top-level audioUrl
  const audioOverviewHref =
    isAudioOverviewNote(note) && note.status === "completed" ? note.audioUrl?.trim() : "";
  const audioNoteHref =
    note.type === "audio" && isAudioNote(note) && note.status === "completed"
      ? note.metadata.audioUrl?.trim()
      : "";

  if (audioOverviewHref || audioNoteHref) {
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          onPlayAudio?.(note);
        }}
        className="shrink-0 w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center opacity-70 group-hover:opacity-100 hover:!opacity-100 hover:bg-primary hover:text-primary-foreground transition-all"
        aria-label="Play audio"
      >
        <Play className="w-3.5 h-3.5 fill-current ml-0.5 shrink-0" />
      </button>
    );
  }

  // Type-specific icons
  const iconConfig: Record<
    string,
    { icon: React.FC<{ className?: string }>; bgClass: string; textClass: string }
  > = {
    flashcard: { icon: Layers, bgClass: "bg-red-500/10", textClass: "text-red-700" },
    report: { icon: FileText, bgClass: "bg-amber-500/10", textClass: "text-amber-600" },
    quiz: { icon: HelpCircle, bgClass: "bg-blue-500/10", textClass: "text-blue-700" },
    mindmap: { icon: GitFork, bgClass: "bg-fuchsia-500/10", textClass: "text-fuchsia-600" },
    writtenQuestions: {
      icon: MessageSquareText,
      bgClass: "bg-green-500/10",
      textClass: "text-green-700",
    },
    slides: { icon: Presentation, bgClass: "bg-violet-500/10", textClass: "text-violet-600" },
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
