import { createContext, useContext, ReactNode } from 'react';
import { Source } from '@/shared/types/index';

export interface SourcesContextType {
  sources: Source[];
  onToggleSource: (id: string) => void;
  onToggleAll: () => void;
  onAddSource: (source: Source) => void;
  onDeleteSource: (id: string) => void;
  onRenameSource: (id: string, newTitle: string) => void;
}

const SourcesContext = createContext<SourcesContextType | undefined>(undefined);

interface SourcesProviderProps {
  children: ReactNode;
  value: SourcesContextType;
}

export function SourcesProvider({ children, value }: SourcesProviderProps) {
  return (
    <SourcesContext.Provider value={value}>
      {children}
    </SourcesContext.Provider>
  );
}

export function useSourcesContext() {
  const context = useContext(SourcesContext);
  if (!context) throw new Error('useSourcesContext must be used within SourcesProvider');
  return context;
}
