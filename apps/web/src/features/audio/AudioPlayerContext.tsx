import { createContext, useContext, ReactNode } from 'react';

export interface AudioPlayerContextType {
  miniPlayerVisible: boolean;
  miniPlayerData: {
    audioUrl: string;
    title: string;
    transcript?: string;
    /** When set (audio overview notes), URL is resolved server-side via `storage.getUrl`. */
    audioOverviewId?: string;
  } | null;
  onPlayAudio: (
    audioUrl: string,
    title: string,
    transcript?: string,
    noteId?: string,
    audioOverviewId?: string
  ) => void;
  onCloseMiniPlayer: () => void;
  onExpandAudioPlayer: () => void;
}

const AudioPlayerContext = createContext<AudioPlayerContextType | undefined>(undefined);

interface AudioPlayerProviderProps {
  children: ReactNode;
  value: AudioPlayerContextType;
}

export function AudioPlayerProvider({ children, value }: AudioPlayerProviderProps) {
  return (
    <AudioPlayerContext.Provider value={value}>
      {children}
    </AudioPlayerContext.Provider>
  );
}

export function useAudioPlayerContext() {
  const context = useContext(AudioPlayerContext);
  if (!context) throw new Error('useAudioPlayerContext must be used within AudioPlayerProvider');
  return context;
}
