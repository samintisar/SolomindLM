import type { Id } from "@convex/_generated/dataModel";
import { LiteratureReviewSteps } from "./LiteratureReviewSteps";
import type { ResearchStep } from "./researchStepTypes";

export type { ResearchStep } from "./researchStepTypes";

export function ResearchSteps({
  steps,
  sessionId,
  onOpenRankedPapers,
  onOpenScreeningDecisions,
}: {
  steps: ResearchStep[];
  sessionId?: Id<"literatureReviewSessions">;
  onOpenRankedPapers?: (sessionId: Id<"literatureReviewSessions">) => void;
  onOpenScreeningDecisions?: (sessionId: Id<"literatureReviewSessions">) => void;
}) {
  return (
    <LiteratureReviewSteps
      steps={steps}
      sessionId={sessionId}
      onOpenRankedPapers={onOpenRankedPapers}
      onOpenScreeningDecisions={onOpenScreeningDecisions}
    />
  );
}
