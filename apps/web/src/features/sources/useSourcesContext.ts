import { createContext, useContext } from "react";
import { Source } from "@/shared/types/index";

export interface SourcesContextType {
  sources: Source[];
  onToggleSource: (id: string) => void;
  onToggleAll: (visibleIds: string[]) => void;
  onAddSource: (source: Source) => void;
  onDeleteSource: (id: string) => void;
  onDeleteSelectedSources: (ids: string[]) => Promise<void>;
  onRenameSource: (id: string, newTitle: string) => void;
}

export const SourcesContext = createContext<SourcesContextType | undefined>(undefined);

export function useSourcesContext() {
  const context = useContext(SourcesContext);
  if (!context) throw new Error("useSourcesContext must be used within SourcesProvider");
  return context;
}
