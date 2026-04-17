import type { ReactNode } from "react";
import type { Note, Source } from "@/shared/types/index";

/** Shared context passed to all create-flow hooks. */
export interface CreateFlowContext {
  notes: Note[];
  sources: Source[];
  userId: string | null | undefined;
  noteId: string | null | undefined;
  onAddNote: (note: Note) => void;
  onUpdateNoteFull?: (id: string, note: Note) => void;
  onDeleteNote: (id: string) => void;
  confirm?: (
    title: string,
    message: string | ReactNode,
    options?: {
      confirmText?: string;
      cancelText?: string;
      variant?: "danger" | "warning" | "default";
    }
  ) => Promise<boolean>;
  toast?: {
    success: (message: string) => void;
    error: (message: string) => void;
    info: (message: string) => void;
    loading: (message: string) => void;
  };
}
