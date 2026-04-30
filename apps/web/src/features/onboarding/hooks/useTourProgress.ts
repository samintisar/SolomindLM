import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

export type TourProgress = {
  createNotebook: boolean;
  addSource: boolean;
  askQuestion: boolean;
  openStudio: boolean;
  generateArtifact: boolean;
  tourNotebookId?: Id<"notebooks">;
};

const EMPTY: TourProgress = {
  createNotebook: false,
  addSource: false,
  askQuestion: false,
  openStudio: false,
  generateArtifact: false,
};

export function useTourProgress(): TourProgress {
  const data = useQuery(api.onboarding.progress.getTourProgress, {});
  return data ?? EMPTY;
}
