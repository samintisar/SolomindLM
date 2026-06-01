import { api } from "@convex/_generated/api";
import { useMutation, useQuery } from "convex/react";

export function useOutputLanguage(isAuthenticated: boolean) {
  const prefs = useQuery(api.userPreferences.index.getMyPreferences, isAuthenticated ? {} : "skip");
  const setLanguageMutation = useMutation(api.userPreferences.index.setOutputLanguage);
  return {
    language: prefs?.outputLanguage ?? "en",
    isLoading: prefs === undefined,
    setLanguage: (code: string) => {
      void setLanguageMutation({ outputLanguage: code }).catch((err) => {
        console.error("[language] setOutputLanguage failed", err);
      });
    },
  };
}
