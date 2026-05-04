import { ReactNode } from "react";
import { StudioContext, StudioContextType } from "./useStudioContext";

interface StudioProviderProps {
  children: ReactNode;
  value: StudioContextType;
}

export function StudioProvider({ children, value }: StudioProviderProps) {
  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}
