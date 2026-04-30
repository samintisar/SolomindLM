import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";

export function useOutputLanguage() {
  const prefs = useQuery(api.userPreferences.index.getMyPreferences);
  const setLanguageMutation = useMutation(api.userPreferences.index.setOutputLanguage);
  return {
    language: prefs?.outputLanguage ?? "en",
    isLoading: prefs === undefined,
    setLanguage: (code: string) => void setLanguageMutation({ outputLanguage: code }),
  };
}
