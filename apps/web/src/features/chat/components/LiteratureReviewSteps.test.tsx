import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LiteratureReviewSteps } from "./LiteratureReviewSteps";
import type { ResearchStep } from "./researchStepTypes";

const sessionId = "session123" as import("@convex/_generated/dataModel").Id<"literatureReviewSessions">;

const baseSteps: ResearchStep[] = [
  {
    type: "searching",
    status: "completed",
    title: "Searching relevant studies",
    description: "Search complete",
  },
  {
    type: "ranking",
    status: "completed",
    title: "Ranking candidate papers",
    description: "Ranked papers",
    details: "Ranked 100 papers for your research question.",
  },
  {
    type: "screening",
    status: "completed",
    title: "Screening the selected studies",
    description: "Screening complete",
    details: "Screened 30 papers: 15 included, 15 excluded.",
  },
];

describe("LiteratureReviewSteps drill-down pills", () => {
  it("opens ranked papers when ranking pill is clicked", async () => {
    const user = userEvent.setup();
    const onOpenRankedPapers = vi.fn();
    const onOpenScreeningDecisions = vi.fn();

    render(
      <LiteratureReviewSteps
        steps={baseSteps}
        expandAll
        sessionId={sessionId}
        onOpenRankedPapers={onOpenRankedPapers}
        onOpenScreeningDecisions={onOpenScreeningDecisions}
      />
    );

    await user.click(
      screen.getByRole("button", { name: /Ranked 100 papers for your research question/i })
    );

    expect(onOpenRankedPapers).toHaveBeenCalledWith(sessionId);
    expect(onOpenScreeningDecisions).not.toHaveBeenCalled();
  });

  it("opens screening decisions when screening pill is clicked", async () => {
    const user = userEvent.setup();
    const onOpenRankedPapers = vi.fn();
    const onOpenScreeningDecisions = vi.fn();

    render(
      <LiteratureReviewSteps
        steps={baseSteps}
        expandAll
        sessionId={sessionId}
        onOpenRankedPapers={onOpenRankedPapers}
        onOpenScreeningDecisions={onOpenScreeningDecisions}
      />
    );

    await user.click(
      screen.getByRole("button", { name: /Screened 30 papers: 15 included, 15 excluded/i })
    );

    expect(onOpenScreeningDecisions).toHaveBeenCalledWith(sessionId);
    expect(onOpenRankedPapers).not.toHaveBeenCalled();
  });

  it("hides redundant report-complete detail text", () => {
    const steps: ResearchStep[] = [
      {
        type: "generating_report",
        status: "completed",
        title: "Synthesizing answer",
        description: "Writing a cited research answer.",
        details: "Report generation complete",
      },
    ];

    render(<LiteratureReviewSteps steps={steps} expandAll />);

    expect(screen.queryByText("Report generation complete")).toBeNull();
    expect(screen.getByText("Synthesizing answer")).toBeTruthy();
  });

  it("renders non-clickable pills when callbacks are missing", () => {
    render(<LiteratureReviewSteps steps={baseSteps} expandAll sessionId={sessionId} />);

    expect(
      screen.queryByRole("button", { name: /Ranked 100 papers for your research question/i })
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Screened 30 papers: 15 included, 15 excluded/i })
    ).toBeNull();
    expect(screen.getByText(/Ranked 100 papers for your research question/i)).toBeTruthy();
    expect(screen.getByText(/Screened 30 papers: 15 included, 15 excluded/i)).toBeTruthy();
  });
});
