import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";
import type { FeedbackType } from "./feedbackTypes";

interface FeedbackContextValue {
  isOpen: boolean;
  defaultType: FeedbackType;
  open: (type?: FeedbackType) => void;
  close: () => void;
}

const FeedbackContext = createContext<FeedbackContextValue | undefined>(undefined);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [defaultType, setDefaultType] = useState<FeedbackType>("bug");

  const open = useCallback((type: FeedbackType = "bug") => {
    setDefaultType(type);
    setIsOpen(true);
  }, []);
  const close = useCallback(() => setIsOpen(false), []);

  const value = useMemo(
    () => ({ isOpen, defaultType, open, close }),
    [isOpen, defaultType, open, close]
  );
  return <FeedbackContext.Provider value={value}>{children}</FeedbackContext.Provider>;
}

export function useFeedback(): FeedbackContextValue {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error("useFeedback must be used within FeedbackProvider");
  return ctx;
}
