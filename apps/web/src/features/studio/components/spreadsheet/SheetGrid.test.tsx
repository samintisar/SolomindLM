import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SheetGrid } from "./SheetGrid";
import type { Grid } from "./sheetModel";

// jsdom has no layout; src/test/setup.ts stubs scrollIntoView and the pointer-capture APIs Radix menus use.

const GRID: Grid = [
  ["Name", "Score"],
  ["item 10", "3"],
  ["item 2", "1"],
  ["Apple", ""],
];

/** Renders the grid under a parent that owns the state, as SpreadsheetView does. */
function renderSheet(
  initial: Grid = GRID,
  {
    readOnly = false,
    onRowRender,
  }: { readOnly?: boolean; onRowRender?: (row: number) => void } = {}
) {
  const onChange = vi.fn<(next: Grid) => void>();
  function Harness() {
    const [grid, setGrid] = useState(initial);
    return (
      <SheetGrid
        grid={grid}
        readOnly={readOnly}
        onRowRender={onRowRender}
        onChange={(next) => {
          onChange(next);
          setGrid(next);
        }}
      />
    );
  }
  render(<Harness />);
  return { onChange };
}

/** The data cell at a 1-based body row and 0-based column. */
function cell(row: number, col: number): HTMLElement {
  const rows = screen.getAllByRole("row");
  return within(rows[row]).getAllByRole("gridcell")[col];
}

function lastGrid(onChange: ReturnType<typeof renderSheet>["onChange"]): Grid {
  return onChange.mock.lastCall?.[0] as Grid;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("SheetGrid", () => {
  it("renders the headers, row numbers and cells", () => {
    renderSheet();
    expect(screen.getByRole("grid", { name: "Spreadsheet" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Name/ })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Score/ })).toBeInTheDocument();
    for (const n of ["1", "2", "3"]) {
      expect(screen.getByRole("rowheader", { name: n })).toBeInTheDocument();
    }
    expect(cell(1, 0)).toHaveTextContent("item 10");
    expect(cell(3, 0)).toHaveTextContent("Apple");
  });

  it("right-aligns number columns", () => {
    renderSheet();
    expect(cell(1, 1).firstElementChild).toHaveClass("text-right", "tabular-nums");
    expect(cell(1, 0).firstElementChild).not.toHaveClass("text-right");
  });

  it("selects a cell on click and edits it on a second click", async () => {
    const user = userEvent.setup();
    renderSheet();
    await user.click(cell(1, 0));
    expect(cell(1, 0)).toHaveAttribute("aria-selected", "true");
    expect(cell(2, 0)).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("grid")).toHaveFocus();
    expect(screen.queryByRole("textbox")).toBeNull();

    await user.click(cell(1, 0));
    const editor = screen.getByRole("textbox", { name: "Edit Name, row 1" });
    expect(editor).toHaveValue("item 10");
    expect(editor).toHaveFocus();
  });

  it("starts editing with a typed character, and Enter commits and moves down", async () => {
    const user = userEvent.setup();
    const { onChange } = renderSheet();
    await user.click(cell(1, 0));
    await user.keyboard("Z");
    const editor = screen.getByRole("textbox", { name: "Edit Name, row 1" });
    expect(editor).toHaveValue("Z");

    await user.keyboard("ed{Enter}");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(lastGrid(onChange)[1]).toEqual(["Zed", "3"]);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(cell(2, 0)).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("grid")).toHaveFocus();
  });

  it("Shift+Enter adds a line break instead of committing", async () => {
    const user = userEvent.setup();
    const { onChange } = renderSheet();
    await user.dblClick(cell(1, 0));
    await user.keyboard("{Shift>}{Enter}{/Shift}x");
    expect(screen.getByRole("textbox")).toHaveValue("item 10\nx");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("Escape cancels the edit", async () => {
    const user = userEvent.setup();
    const { onChange } = renderSheet();
    await user.dblClick(cell(1, 0));
    await user.keyboard("xyz{Escape}");
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
    expect(cell(1, 0)).toHaveTextContent("item 10");
    expect(screen.getByRole("grid")).toHaveFocus();
  });

  it("Tab commits and moves right", async () => {
    const user = userEvent.setup();
    const { onChange } = renderSheet();
    await user.click(cell(1, 0));
    await user.keyboard("{Enter}!{Tab}");
    expect(lastGrid(onChange)[1]).toEqual(["item 10!", "3"]);
    expect(cell(1, 1)).toHaveAttribute("aria-selected", "true");
  });

  it("commits on blur", async () => {
    const user = userEvent.setup();
    const { onChange } = renderSheet();
    await user.dblClick(cell(1, 0));
    await user.keyboard("!");
    await user.click(cell(3, 1));
    expect(lastGrid(onChange)[1]).toEqual(["item 10!", "3"]);
    expect(cell(3, 1)).toHaveAttribute("aria-selected", "true");
  });

  it("Delete clears the selected cell", async () => {
    const user = userEvent.setup();
    const { onChange } = renderSheet();
    await user.click(cell(2, 0));
    await user.keyboard("{Delete}");
    expect(lastGrid(onChange)[2]).toEqual(["", "1"]);
  });

  it("moves the selection with the arrows, Home and End, never into the header", async () => {
    const user = userEvent.setup();
    renderSheet();
    const grid = screen.getByRole("grid");
    grid.focus();
    await user.keyboard("{ArrowDown}");
    expect(cell(1, 0)).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowDown}{ArrowRight}");
    expect(cell(2, 1)).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowRight}");
    expect(cell(2, 1)).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowUp}{ArrowUp}{ArrowUp}");
    expect(cell(1, 1)).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Home}");
    expect(cell(1, 0)).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{End}");
    expect(cell(1, 1)).toHaveAttribute("aria-selected", "true");
  });

  it("Tab without an edit wraps to the next row", async () => {
    const user = userEvent.setup();
    renderSheet();
    await user.click(cell(1, 1));
    await user.keyboard("{Tab}");
    expect(cell(2, 0)).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(cell(1, 1)).toHaveAttribute("aria-selected", "true");
  });

  it("Add row appends a row and edits its first cell", async () => {
    const user = userEvent.setup();
    const { onChange } = renderSheet();
    await user.click(screen.getByRole("button", { name: "Add row" }));
    const next = lastGrid(onChange);
    expect(next).toHaveLength(5);
    expect(next[4]).toEqual(["", ""]);
    expect(screen.getByRole("textbox", { name: "Edit Name, row 4" })).toHaveFocus();
  });

  it("Add column appends a column and edits its header", async () => {
    const user = userEvent.setup();
    const { onChange } = renderSheet();
    await user.click(screen.getByRole("button", { name: "Add column" }));
    const next = lastGrid(onChange);
    expect(next[0]).toEqual(["Name", "Score", "Column 3"]);
    expect(next[1]).toEqual(["item 10", "3", ""]);
    const editor = screen.getByRole("textbox", { name: "Rename column Column 3" });
    expect(editor).toHaveValue("Column 3");
    expect(editor).toHaveFocus();
  });

  it("sorts from the column menu", async () => {
    const user = userEvent.setup();
    const { onChange } = renderSheet();
    await user.click(screen.getByRole("button", { name: /Name/ }));
    await user.click(await screen.findByRole("menuitem", { name: /Sort A → Z/ }));
    expect(lastGrid(onChange).map((row) => row[0])).toEqual(["Name", "Apple", "item 2", "item 10"]);
    expect(cell(1, 0)).toHaveAttribute("aria-selected", "true");
  });

  it("names the sort items by size on a number column", async () => {
    const user = userEvent.setup();
    const { onChange } = renderSheet();
    await user.click(screen.getByRole("button", { name: /Score/ }));
    await user.click(await screen.findByRole("menuitem", { name: /Sort largest first/ }));
    expect(lastGrid(onChange).map((row) => row[1])).toEqual(["Score", "3", "1", ""]);
  });

  it("inserts a column to the right from the menu", async () => {
    const user = userEvent.setup();
    const { onChange } = renderSheet();
    await user.click(screen.getByRole("button", { name: /Name/ }));
    await user.click(await screen.findByRole("menuitem", { name: /Insert column right/ }));
    expect(lastGrid(onChange)[0]).toEqual(["Name", "Column 2", "Score"]);
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Rename column Column 2" })).toHaveFocus()
    );
  });

  it("renames a column from the menu", async () => {
    const user = userEvent.setup();
    const { onChange } = renderSheet();
    await user.click(screen.getByRole("button", { name: /Name/ }));
    await user.click(await screen.findByRole("menuitem", { name: /Rename/ }));
    const editor = await screen.findByRole("textbox", { name: "Rename column Name" });
    await waitFor(() => expect(editor).toHaveFocus());
    await user.clear(editor);
    await user.keyboard("Title{Enter}");
    expect(lastGrid(onChange)[0]).toEqual(["Title", "Score"]);
    expect(screen.getByRole("button", { name: /Title/ })).toBeInTheDocument();
  });

  it("confirms before deleting a column that has data", async () => {
    const user = userEvent.setup();
    const { onChange } = renderSheet();
    await user.click(screen.getByRole("button", { name: /Name/ }));
    await user.click(await screen.findByRole("menuitem", { name: /Delete column/ }));
    const dialog = await screen.findByRole("alertdialog", { name: "Delete column “Name”?" });
    expect(dialog).toHaveTextContent("Its 3 filled cells will be removed. This can't be undone.");
    expect(onChange).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(lastGrid(onChange)).toEqual([["Score"], ["3"], ["1"], [""]]);
  });

  it("deletes an empty column at once", async () => {
    const user = userEvent.setup();
    const { onChange } = renderSheet([
      ["A", "B"],
      ["x", ""],
    ]);
    await user.click(screen.getByRole("button", { name: "B" }));
    await user.click(await screen.findByRole("menuitem", { name: /Delete column/ }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(lastGrid(onChange)).toEqual([["A"], ["x"]]);
  });

  it("won't delete the last column", async () => {
    const user = userEvent.setup();
    renderSheet([["A"], ["x"]]);
    await user.click(screen.getByRole("button", { name: "A" }));
    expect(await screen.findByRole("menuitem", { name: /Delete column/ })).toHaveAttribute(
      "aria-disabled",
      "true"
    );
  });

  it("is read-only: no add buttons, no menus and no editing", async () => {
    const user = userEvent.setup();
    const { onChange } = renderSheet(GRID, { readOnly: true });
    expect(screen.getByRole("grid")).toHaveAttribute("aria-readonly", "true");
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByRole("columnheader", { name: /Name/ })).toBeInTheDocument();

    await user.dblClick(cell(1, 0));
    await user.click(cell(1, 0));
    await user.keyboard("x{Delete}");
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();

    await user.keyboard("{ArrowDown}");
    expect(cell(2, 0)).toHaveAttribute("aria-selected", "true");
  });

  it("is one tab stop: Tab from the last cell skips the header menus to Add row", async () => {
    const user = userEvent.setup();
    renderSheet();
    await user.click(cell(3, 1));
    await user.keyboard("{Tab}");
    expect(screen.getByRole("button", { name: "Add row" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Name" })).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("button", { name: "Add column" })).toHaveAttribute("tabindex", "-1");
  });

  it("opens the selected cell's column menu with Shift+F10 or the ContextMenu key", async () => {
    const user = userEvent.setup();
    renderSheet();
    expect(screen.getByRole("grid")).toHaveAttribute("aria-keyshortcuts", "Shift+F10");
    await user.click(cell(1, 1));
    await user.keyboard("{Shift>}{F10}{/Shift}");
    expect(
      await screen.findByRole("menuitem", { name: /Sort smallest first/ })
    ).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    await waitFor(() => expect(screen.getByRole("grid")).toHaveFocus());

    await user.keyboard("{ArrowLeft}{ContextMenu}");
    expect(await screen.findByRole("menuitem", { name: /Sort A → Z/ })).toBeInTheDocument();
  });

  it("points aria-activedescendant at the selected cell", async () => {
    const user = userEvent.setup();
    renderSheet();
    const grid = screen.getByRole("grid");
    expect(grid).not.toHaveAttribute("aria-activedescendant");
    await user.click(cell(1, 0));
    expect(cell(1, 0).id).not.toBe("");
    expect(grid).toHaveAttribute("aria-activedescendant", cell(1, 0).id);
    await user.keyboard("{ArrowDown}");
    expect(grid).toHaveAttribute("aria-activedescendant", cell(2, 0).id);
    expect(cell(2, 0).id).not.toBe(cell(1, 0).id);
  });

  it("a header edit ended by a click doesn't turn that click into an edit", async () => {
    const user = userEvent.setup();
    renderSheet();
    await user.click(screen.getByRole("button", { name: "Add column" }));
    expect(screen.getByRole("textbox", { name: "Rename column Column 3" })).toHaveFocus();
    await user.click(cell(1, 2));
    expect(cell(1, 2)).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("keeps aria-rowcount to the header and data rows", () => {
    renderSheet();
    expect(screen.getByRole("grid")).toHaveAttribute("aria-rowcount", "4");
    expect(screen.getAllByRole("row")).toHaveLength(4);
  });

  it("ignores Enter while an IME is composing", async () => {
    const user = userEvent.setup();
    const { onChange } = renderSheet();
    await user.dblClick(cell(1, 0));
    const editor = screen.getByRole("textbox");
    fireEvent.keyDown(editor, { key: "Enter", keyCode: 229 });
    expect(screen.getByRole("textbox")).toBe(editor);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("re-renders only the rows that change", async () => {
    const user = userEvent.setup();
    const big: Grid = [["A", "B"], ...Array.from({ length: 40 }, (_, i) => [`a${i}`, `b${i}`])];
    const onRowRender = vi.fn<(row: number) => void>();
    renderSheet(big, { onRowRender });
    await user.click(cell(1, 0));

    onRowRender.mockClear();
    await user.keyboard("{ArrowDown}");
    const moved = new Set(onRowRender.mock.calls.map(([row]) => row));
    expect([...moved].sort()).toEqual([1, 2]);
    expect(onRowRender.mock.calls.length).toBeLessThanOrEqual(2);

    await user.keyboard("{Enter}");
    onRowRender.mockClear();
    await user.keyboard("xyz");
    expect(new Set(onRowRender.mock.calls.map(([row]) => row))).toEqual(new Set([2]));

    onRowRender.mockClear();
    await user.keyboard("{Enter}");
    expect(new Set(onRowRender.mock.calls.map(([row]) => row))).toEqual(new Set([2, 3]));
  });

  it("flashes an edited cell for 900 ms", () => {
    vi.useFakeTimers();
    renderSheet();
    fireEvent.click(cell(1, 0));
    fireEvent.keyDown(screen.getByRole("grid"), { key: "Delete" });
    expect(cell(1, 0)).toHaveClass("bg-success-muted");
    act(() => {
      vi.advanceTimersByTime(899);
    });
    expect(cell(1, 0)).toHaveClass("bg-success-muted");
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(cell(1, 0)).not.toHaveClass("bg-success-muted");
  });
});
