import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StreakChip } from "./StreakChip";

describe("StreakChip", () => {
  it.each([0, 1])("shows nothing visible at a streak of %s", (streak) => {
    render(<StreakChip streak={streak} />);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("says how many are in a row from two", () => {
    const { rerender } = render(<StreakChip streak={1} />);
    rerender(<StreakChip streak={2} />);
    expect(screen.getByRole("status")).toHaveTextContent("2 in a row");
    rerender(<StreakChip streak={5} />);
    expect(screen.getByText("5 in a row")).toBeInTheDocument();
  });
});
