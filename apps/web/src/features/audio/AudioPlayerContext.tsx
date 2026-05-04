import { ReactNode } from "react";
import { AudioPlayerContext, AudioPlayerContextType } from "./useAudioPlayer";

interface AudioPlayerProviderProps {
  children: ReactNode;
  value: AudioPlayerContextType;
}

export function AudioPlayerProvider({ children, value }: AudioPlayerProviderProps) {
  return <AudioPlayerContext.Provider value={value}>{children}</AudioPlayerContext.Provider>;
}
