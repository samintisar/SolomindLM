import { createContext, useContext } from "react";
import { Note } from "@/shared/types/index";

export interface StudioContextType {
  notes: Note[];
  onUpdateNote: (id: string, newTitle: string) => void;
  onUpdateNoteFull: (id: string, note: Note) => void;
  onDeleteNote: (id: string) => void;
  onAddNote: (note: Note) => void;
  onSaveReportContent: (reportId: string, content: string) => Promise<void>;
}

export const StudioContext = createContext<StudioContextType | undefined>(undefined);

export function useStudioContext() {
  const context = useContext(StudioContext);
  if (!context) throw new Error("useStudioContext must be used within StudioProvider");
  return context;
}
