export type LiteratureScreeningDecision = {
  paperIndex: number;
  title: string;
  authors: string[];
  year?: number;
  decision: "included" | "excluded";
  reason: string;
  rank?: number;
};
