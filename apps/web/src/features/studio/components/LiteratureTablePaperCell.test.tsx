import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import type { TablePaperRow } from "../utils/literatureTablePaper";
import { LiteratureTablePaperCell } from "./LiteratureTablePaperCell";

const searchPaper: TablePaperRow = {
  citationId: "c1",
  rowData: {},
  isIncluded: true,
  citation: {
    title: "Sleep and memory",
    authors: ["A. Author"],
    url: "https://example.com/paper",
    sourceApi: "pubmed",
  },
};

const notebookPaper: TablePaperRow = {
  ...searchPaper,
  citation: {
    title: "My uploaded study",
    authors: ["B. Writer"],
    url: "",
    sourceApi: "notebook",
    documentId: "doc1",
  },
};

function renderCell(paper: TablePaperRow) {
  return render(
    <LiteratureTablePaperCell
      rank={1}
      paper={paper}
      columns={[]}
      isSelected={false}
      isAdding={false}
      isInNotebook={false}
      onToggleSelect={vi.fn()}
      onCite={vi.fn()}
      onAddToNotebook={vi.fn()}
    />
  );
}

describe("LiteratureTablePaperCell", () => {
  test("a search paper can be added to the notebook and has no notebook badges", () => {
    renderCell(searchPaper);
    expect(screen.getByRole("button", { name: "Add to notebook" })).toBeInTheDocument();
    expect(screen.queryByText("Your paper")).not.toBeInTheDocument();
    expect(screen.queryByText("Off-topic?")).not.toBeInTheDocument();
  });

  test("a notebook paper is marked as the user's and can't be added again", () => {
    renderCell(notebookPaper);
    expect(screen.getByText("Your paper")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /notebook/i })).not.toBeInTheDocument();
  });

  test("a notebook paper without a link shows its title as plain text", () => {
    renderCell(notebookPaper);
    expect(screen.getByText("My uploaded study").closest("a")).toBeNull();
  });

  test("an off-topic notebook paper is flagged with the reason", async () => {
    renderCell({ ...notebookPaper, offTopicReason: "Studies diet, not sleep" });
    const flag = screen.getByText("Off-topic?");
    expect(flag).toHaveAccessibleDescription("Studies diet, not sleep");
    await userEvent.hover(flag);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Studies diet, not sleep");
  });
});
