import { createContext, useContext, ReactNode } from 'react';
import { Note } from '@/shared/types/index';

export interface StudioContextType {
  notes: Note[];
  onUpdateNote: (id: string, newTitle: string) => void;
  onUpdateNoteFull: (id: string, note: Note) => void;
  onDeleteNote: (id: string) => void;
  onAddNote: (note: Note) => void;
  onSaveReportContent: (reportId: string, content: string) => Promise<void>;
}

const StudioContext = createContext<StudioContextType | undefined>(undefined);

interface StudioProviderProps {
  children: ReactNode;
  value: StudioContextType;
}

export function StudioProvider({ children, value }: StudioProviderProps) {
  return (
    <StudioContext.Provider value={value}>
      {children}
    </StudioContext.Provider>
  );
}

export function useStudioContext() {
  const context = useContext(StudioContext);
  if (!context) throw new Error('useStudioContext must be used within StudioProvider');
  return context;
}
