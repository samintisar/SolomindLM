export type ScreeningCriterionStatus = "met" | "unclear" | "not_met";

/** How one paper fared against one eligibility criterion, as recorded by screening. */
export type ScreeningCriterionCheck = {
  label: string;
  status: ScreeningCriterionStatus;
  explanation: string;
};

/** An eligibility criterion the review screened papers against. */
export type ScreeningCriterion = { label: string; description: string };

export type LiteratureScreeningDecision = {
  paperIndex: number;
  title: string;
  authors: string[];
  year?: number;
  decision: "included" | "excluded";
  reason: string;
  /** Absent on reviews screened before criteria were recorded. */
  criteria?: ScreeningCriterionCheck[];
  rank?: number;
};
