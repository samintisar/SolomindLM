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
    await userEvent.click(screen.getByRole("button", { name: /Literature table/ }));
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
