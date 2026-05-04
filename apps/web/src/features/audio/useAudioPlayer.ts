import { createContext, useContext } from "react";

export interface AudioPlayerContextType {
  miniPlayerVisible: boolean;
  miniPlayerData: {
    audioUrl: string;
    title: string;
    transcript?: string;
    /** When set (audio overview notes), URL is resolved server-side via `storage.getUrl`. */
    audioOverviewId?: string;
    /** Studio note id — used to hide the docked mini player when that note is open in expanded view. */
    noteId?: string;
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
