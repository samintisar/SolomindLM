import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FileText } from "lucide-react";
import { describe, expect, test, vi } from "vitest";
import { ResultCard } from "./ResultCard";

describe("ResultCard", () => {
  test("is one labelled button", async () => {
    const onOpen = vi.fn();
    render(
      <ResultCard
        icon={FileText}
        title="Literature table"
        description="24 papers"
        onOpen={onOpen}
      />
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAccessibleName(/Literature table/);
    expect(buttons[0]).toHaveAccessibleName(/24 papers/);
    await userEvent.click(buttons[0]);
    expect(onOpen).toHaveBeenCalled();
  });

  test("shows the description and omits it when absent", () => {
    const { rerender } = render(
      <ResultCard icon={FileText} title="Report" description="Document" onOpen={vi.fn()} />
    );
    expect(screen.getByRole("button", { name: /Report/ })).toHaveTextContent("Document");
    rerender(<ResultCard icon={FileText} title="Report" onOpen={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Report" })).toBeInTheDocument();
  });
});
