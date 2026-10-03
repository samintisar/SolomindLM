import type { UseCasePack } from "../types";

/**
 * Professionals: industry and market reports uploaded as PDF (here US federal
 * reports on the economy, energy, agriculture and AI partnerships). Rubric checks
 * describe what a good business summary looks like for any report, not these
 * particular sources.
 */
export const professionalsPack: UseCasePack = {
  id: "professionals",
  title: "Professionals",
  notebookTitle: "Professionals",
  advertisedClaim: "Summarize industry reports and stay updated with minimal reading time.",
  features: ["report", "chat", "mindmap", "spreadsheet"],
  sources: [
    "regional-economy-beige-book.pdf",
    "energy-outlook-steo.pdf",
    "feed-grains-outlook.pdf",
    "ai-partnerships-ftc.pdf",
  ],
  rubric: [
    {
      id: "numbers-exact",
      question:
        "Do all figures, units, dates and time periods in the output match the source exactly (no changed values, wrong year or wrong unit)?",
      appliesTo: ["report", "chat", "spreadsheet", "mindmap"],
      evidence: "sources",
    },
    {
      id: "forecast-not-fact",
      question:
        "Does the output keep the source's distinction between reported data, estimates and forecasts or projections, never stating a forecast as an outcome that has happened?",
      appliesTo: ["report", "chat", "spreadsheet"],
      evidence: "sources",
    },
    {
      id: "attributed-correctly",
      question:
        "Is every finding attributed to the report or organisation it comes from, with no findings from one report presented as coming from another?",
      appliesTo: ["report", "chat", "mindmap"],
      evidence: "sources",
    },
    {
      id: "exec-summary-leads",
      question:
        "Does the report open with a short summary of the main takeaways before the detailed sections?",
      appliesTo: ["report"],
      evidence: "output",
    },
    {
      id: "table-cells-from-source",
      question:
        "Is every cell in the table a value stated in the source, with the unit and time period clear from the column or row headers?",
      appliesTo: ["spreadsheet"],
      evidence: "sources",
    },
    {
      id: "no-unsourced-advice",
      question:
        "Does the output avoid investment, trading or policy recommendations and outside facts that the source does not contain?",
      appliesTo: ["report", "chat"],
      evidence: "sources",
    },
  ],
};
