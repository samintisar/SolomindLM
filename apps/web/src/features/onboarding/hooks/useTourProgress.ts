import type { Id } from "@convex/_generated/dataModel";

export type TourProgress = {
  createNotebook: boolean;
  addSource: boolean;
  askQuestion: boolean;
  generateArtifact: boolean;
  tourNotebookId?: Id<"notebooks">;
};
