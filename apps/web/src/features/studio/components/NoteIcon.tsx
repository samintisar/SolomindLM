import type React from "react";
import type { Note } from "@/shared/types/index";
import { cn } from "@/shared/utils/cn";
import { studioTypeStyle } from "../studioTypeStyle";

interface NoteIconProps {
  note: Note;
  /** Plays the one-off pop when the note has just finished generating. */
  popped?: boolean;
}

/**
 * The type tile on a Saved row, coloured like the Create grid (STUDIO_TOOLS). While the note is
 * generating, its type icon bobs in place of a spinner; the row's Sheen and progress bar carry the
 * rest of the progress signal.
 */
export const NoteIcon: React.FC<NoteIconProps> = ({ note, popped = false }) => {
  const { icon: Icon, tileClass } = studioTypeStyle(note);
  const generating = note.status === "generating";
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-lg",
        tileClass,
        popped && "animate-studio-pop motion-reduce:animate-none"
      )}
    >
      <Icon
        className={cn(
          "size-4 shrink-0",
          generating && "animate-studio-bob motion-reduce:animate-none"
        )}
      />
    </span>
  );
};
