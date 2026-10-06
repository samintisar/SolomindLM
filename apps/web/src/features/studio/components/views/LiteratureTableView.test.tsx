import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TableColumn } from "../ColumnManager";
import { type LiteratureTable, LiteratureTableView } from "./LiteratureTableView";

vi.mock("@/features/sources/services/documentsApi", () => ({
  useGetExistingPapers: () => ({ dois: [], titleHashes: [] }),
  useBulkUpload: () => vi.fn(),
}));
vi.mock("@/shared/contexts/useToast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

const COLUMNS: TableColumn[] = [
  { id: "title", name: "Title", type: "paper_title", isVisible: true, isSystem: true, order: 0 },
  { id: "method", name: "Method", type: "custom", isVisible: true, isSystem: false, order: 1 },
];
const TABLE: LiteratureTable = {
  title: "Transformers review",
  columns: COLUMNS,
  papers: [
    {
      citationId: "c1",
      rowData: { title: "Attention", method: "Self-attention" },
      isIncluded: true,
      citation: null,
    },
    {
      citationId: "c2",
      rowData: { title: "BERT", method: "Masked LM" },
      isIncluded: true,
      citation: null,
    },
  ],
};

function renderTable(props: Partial<React.ComponentProps<typeof LiteratureTableView>> = {}) {
  const onExport = vi.fn();
  render(
    <LiteratureTableView
      table={TABLE}
      notebookId={"n1" as never}
      onBack={vi.fn()}
      onExport={onExport}
      {...props}
    />
  );
  return { onExport };
}

beforeEach(() => vi.clearAllMocks());

describe("LiteratureTableView", () => {
  it("renders the papers in a table with a column per data column", () => {
    renderTable();
    const table = screen.getByRole("table");
    expect(within(table).getByRole("columnheader", { name: /Papers \(2\)/ })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "Method" })).toBeInTheDocument();
    expect(within(table).getByText("Self-attention")).toBeInTheDocument();
  });

  it("exports CSV and Excel from the Export menu", async () => {
    const user = userEvent.setup();
    const { onExport } = renderTable();
    await user.click(screen.getByRole("button", { name: "Export table" }));
    await user.click(await screen.findByRole("menuitem", { name: "CSV (.csv)" }));
    expect(onExport).toHaveBeenCalledWith("csv");
    await user.click(screen.getByRole("button", { name: "Export table" }));
    await user.click(await screen.findByRole("menuitem", { name: "Excel (.xlsx)" }));
    expect(onExport).toHaveBeenCalledWith("excel");
  });

  it("select all checks every paper and shows the bulk bar", async () => {
    const user = userEvent.setup();
    renderTable();
    await user.click(screen.getByRole("checkbox", { name: "Select all papers" }));
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add 2 to notebook" })).toBeInTheDocument();
  });

  it("full screen opens over the page and Escape leaves it", async () => {
    const user = userEvent.setup();
    renderTable();
    await user.click(screen.getByRole("button", { name: "Full screen table" }));
    expect(screen.getByRole("button", { name: "Exit full screen" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Full screen table" })).toBeInTheDocument()
    );
  });

  it("shows an empty state with Add Papers when there are no papers", async () => {
    const user = userEvent.setup();
    const onAddPapers = vi.fn();
    renderTable({ table: { ...TABLE, papers: [] }, onAddPapers });
    expect(screen.getByText("No papers in this table yet")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: /Add Papers/ }).at(-1) as HTMLElement);
    expect(onAddPapers).toHaveBeenCalled();
  });
});
