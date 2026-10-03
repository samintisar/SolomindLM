import type { UseCasePack } from "../types";

/**
 * Researchers: research papers uploaded as PDF (here four open-access studies of
 * physical activity and depression, one per design). Rubric checks describe what
 * a careful research summary looks like for any papers, not these particular
 * sources.
 */
export const researchersPack: UseCasePack = {
  id: "researchers",
  title: "Researchers",
  notebookTitle: "Researchers",
  advertisedClaim: "Work through literature review mode with papers in your notebook.",
  features: ["chat", "report", "spreadsheet", "mindmap", "literatureReview"],
  sources: [
    "meta-analysis-pearce-2022.pdf",
    "cohort-tilda-2023.pdf",
    "rct-emotion-2018.pdf",
    "cross-sectional-nhanes-2022.pdf",
  ],
  rubric: [
    {
      id: "findings-attributed",
      question:
        "Is every finding attributed to the study it comes from, with that study's design (for example meta-analysis, cohort, trial, cross-sectional survey) described correctly?",
      appliesTo: ["chat", "report", "spreadsheet", "mindmap"],
      evidence: "sources",
    },
    {
      id: "numbers-exact",
      question:
        "Do all effect sizes, confidence intervals, sample sizes, doses and units in the output match the source exactly?",
      appliesTo: ["chat", "report", "spreadsheet"],
      evidence: "sources",
    },
    {
      id: "association-not-causation",
      question:
        "Are results from observational studies (cohort, cross-sectional, meta-analyses of them) described as associations rather than proven effects, unless the source itself claims causation?",
      appliesTo: ["chat", "report", "mindmap"],
      evidence: "sources",
    },
    {
      id: "conflicts-surfaced",
      question:
        "Where the studies disagree or differ in their findings, does the output say so rather than merging them into one conclusion (or do the sources not differ on what the output covers)?",
      appliesTo: ["chat", "report", "mindmap"],
      evidence: "sources",
    },
    {
      id: "limitations-noted",
      question:
        "Does the report mention the main limitations the studies themselves state (such as design, sample size or self-reported measures)?",
      appliesTo: ["report"],
      evidence: "sources",
    },
    {
      id: "review-cites-sources",
      question:
        "Does the literature review describe how papers were searched and screened, and cite the papers it draws its conclusions from?",
      appliesTo: ["literatureReview"],
      evidence: "output",
    },
  ],
};
