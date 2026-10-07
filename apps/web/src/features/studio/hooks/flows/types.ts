import type { ReactNode } from "react";
import type { Note, Source } from "@/shared/types/index";

/** Shared context passed to all create-flow hooks. */
export interface CreateFlowContext {
  sources: Source[];
  isAuthenticated: boolean;
  notebookId: string | null | undefined;
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
}
