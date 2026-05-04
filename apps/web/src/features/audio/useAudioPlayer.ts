import { createContext, useContext } from "react";

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

export const AudioPlayerContext = createContext<AudioPlayerContextType | undefined>(undefined);

export function useAudioPlayerContext() {
  const context = useContext(AudioPlayerContext);
  if (!context) throw new Error("useAudioPlayerContext must be used within AudioPlayerProvider");
  return context;
}
