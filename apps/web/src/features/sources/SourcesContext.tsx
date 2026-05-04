import { ReactNode } from "react";
import { SourcesContext, SourcesContextType } from "./useSourcesContext";

interface SourcesProviderProps {
  children: ReactNode;
  value: SourcesContextType;
}

export function SourcesProvider({ children, value }: SourcesProviderProps) {
  return <SourcesContext.Provider value={value}>{children}</SourcesContext.Provider>;
}
