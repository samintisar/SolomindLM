import { ReactNode } from "react";
import { NotebookContext, NotebookContextType } from "./useNotebookContext";

interface NotebookProviderProps {
  children: ReactNode;
  value: NotebookContextType;
}

export function NotebookProvider({ children, value }: NotebookProviderProps) {
  return <NotebookContext.Provider value={value}>{children}</NotebookContext.Provider>;
}
