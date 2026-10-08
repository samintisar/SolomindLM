import { act, render, screen, waitFor, within } from "@testing-library/react";
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

  it("Escape closes an open menu first, then leaves full screen", async () => {
    const user = userEvent.setup();
    renderTable();
    await user.click(screen.getByRole("button", { name: "Full screen table" }));
    await user.click(screen.getByRole("button", { name: "Export table" }));
    expect(await screen.findByRole("menu")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Exit full screen" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Full screen table" })).toBeInTheDocument()
    );
  });

  it("Manage Columns toggles the column manager", async () => {
    const user = userEvent.setup();
    renderTable();
    const toggle = screen.getByRole("button", { name: "Manage columns" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("complementary", { name: "Manage Columns" })).toBeInTheDocument();
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("complementary", { name: "Manage Columns" })).not.toBeInTheDocument();
  });

  it("opens the column manager on mount only when it fits beside the table", () => {
    const clientWidth = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1200);
    try {
      renderTable();
      expect(screen.getByRole("button", { name: "Manage columns" })).toHaveAttribute(
        "aria-pressed",
        "true"
      );
      expect(screen.getByRole("complementary", { name: "Manage Columns" })).toBeInTheDocument();
    } finally {
      clientWidth.mockRestore();
    }
  });

  it("closes the column manager when the panel narrows below the side-by-side width", () => {
    let width = 1200;
    const clientWidth = vi
      .spyOn(HTMLElement.prototype, "clientWidth", "get")
      .mockImplementation(() => width);
    const resizeCallbacks: (() => void)[] = [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          resizeCallbacks.push(callback);
        }
        observe() {}
        disconnect() {}
      }
    );
    try {
      renderTable();
      expect(screen.getByRole("complementary", { name: "Manage Columns" })).toBeInTheDocument();
      width = 500;
      act(() => {
        for (const callback of resizeCallbacks) callback();
      });
      expect(
        screen.queryByRole("complementary", { name: "Manage Columns" })
      ).not.toBeInTheDocument();
    } finally {
      clientWidth.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("over a narrow table, the column manager takes focus, hides the table and closes on Escape", async () => {
    const user = userEvent.setup();
    renderTable();
    const toggle = screen.getByRole("button", { name: "Manage columns" });
    await user.click(toggle);
    expect(screen.getByRole("button", { name: "Close column manager" })).toHaveFocus();
    expect(screen.getByRole("table").closest("[inert]")).not.toBeNull();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("complementary", { name: "Manage Columns" })).not.toBeInTheDocument();
    expect(toggle).toHaveFocus();
  });

  it("disables Save while saving, under the name Saving table", () => {
    renderTable({ onSave: vi.fn(), isSaving: true });
    expect(screen.getByRole("button", { name: "Saving table" })).toBeDisabled();
  });

  it("shows an empty state with Add Papers when there are no papers", async () => {
    const user = userEvent.setup();
    const onAddPapers = vi.fn();
    renderTable({ table: { ...TABLE, papers: [] }, onAddPapers });
    const empty = screen
      .getByText("No papers in this table yet")
      .closest<HTMLElement>('[data-slot="empty"]');
    expect(empty).not.toBeNull();
    await user.click(within(empty as HTMLElement).getByRole("button", { name: "Add Papers" }));
    expect(onAddPapers).toHaveBeenCalled();
  });

  it("renders no Add Papers buttons without onAddPapers", () => {
    renderTable({ table: { ...TABLE, papers: [] } });
    expect(screen.getByText("No papers in this table yet")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add papers/i })).not.toBeInTheDocument();
  });
});
