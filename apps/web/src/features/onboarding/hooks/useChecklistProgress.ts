import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";

export type ChecklistProgress = {
  createNotebook: boolean;
  addSource: boolean;
  askQuestion: boolean;
  generateArtifact: boolean;
};

const EMPTY: ChecklistProgress = {
  createNotebook: false,
  addSource: false,
  askQuestion: false,
  generateArtifact: false,
};

export function useChecklistProgress(): ChecklistProgress {
  const data = useQuery(api.onboarding.progress.getChecklistProgress, {});
  return data ?? EMPTY;
}
