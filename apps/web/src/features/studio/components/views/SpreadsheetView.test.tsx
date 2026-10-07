import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SpreadsheetNote } from "@/shared/types/index";
import { SpreadsheetView } from "./SpreadsheetView";

// --- Mocks -------------------------------------------------------------------
const saveData = vi.fn<(id: string, data: string) => Promise<unknown>>();
const showError = vi.fn();

vi.mock("../../services/spreadsheetsApi", () => ({
  useSaveSpreadsheetData: () => saveData,
}));

vi.mock("@/shared/hooks/useServiceErrorToast", () => ({
  useServiceErrorToast: () => ({ showError }),
}));

const CSV = "Name,Score\nApple,3\nPear,5";

function makeNote(overrides: Partial<SpreadsheetNote> = {}): SpreadsheetNote {
  return {
    id: "s1",
    title: "Fruit",
    preview: "",
    type: "spreadsheet",
    content: CSV,
    status: "completed",
    metadata: { spreadsheetType: "data_extraction", documentIds: [] },
    ...overrides,
  };
}

/** The data cell at a 1-based body row and 0-based column, inside one view's grid. */
function cell(row: number, col: number, scope: HTMLElement = document.body): HTMLElement {
  const grid = within(scope).getByRole("grid", { name: "Spreadsheet" });
  return within(within(grid).getAllByRole("row")[row]).getAllByRole("gridcell")[col];
}

/** Selects a cell, types a replacement value and commits it with Enter. */
function editCell(row: number, col: number, value: string, scope: HTMLElement = document.body) {
  fireEvent.click(cell(row, col, scope));
  fireEvent.keyDown(within(scope).getByRole("grid", { name: "Spreadsheet" }), { key: value[0] });
  const editor = within(scope).getByRole("textbox");
  fireEvent.change(editor, { target: { value } });
  fireEvent.keyDown(editor, { key: "Enter" });
}

/** Runs pending timers, then lets the promise callbacks they started settle. */
async function advance(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  saveData.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("SpreadsheetView", () => {
  it("renders a completed note's grid with its title and a download button", () => {
    render(<SpreadsheetView note={makeNote()} />);
    expect(screen.getByRole("grid", { name: "Spreadsheet" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Name/ })).toBeInTheDocument();
    expect(cell(1, 0)).toHaveTextContent("Apple");
    expect(cell(2, 1)).toHaveTextContent("5");
    expect(screen.getByText("Fruit")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download CSV" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add row/ })).toBeInTheDocument();
  });

  it("saves an edit after 800 ms and reports Saving…, then Saved · Edited", async () => {
    vi.useFakeTimers();
    let resolveSave: () => void = () => undefined;
    saveData.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        })
    );
    render(<SpreadsheetView note={makeNote()} />);
    expect(screen.getByRole("status")).toHaveTextContent("");

    editCell(1, 0, "Plum");
    expect(cell(1, 0)).toHaveTextContent("Plum");
    expect(screen.getByRole("status")).toHaveTextContent("Saving…");

    await advance(799);
    expect(saveData).not.toHaveBeenCalled();
    await advance(1);
    expect(saveData).toHaveBeenCalledTimes(1);
    expect(saveData).toHaveBeenCalledWith("s1", "Name,Score\nPlum,3\nPear,5");
    expect(screen.getByRole("status")).toHaveTextContent("Saving…");

    await act(async () => {
      resolveSave();
    });
    expect(screen.getByRole("status")).toHaveTextContent("Saved · Edited");
  });

  it("shows Saved · Edited for a sheet edited before it opened", () => {
    const editedAt = Date.UTC(2026, 9, 1, 12);
    render(
      <SpreadsheetView
        note={makeNote({
          metadata: { spreadsheetType: "data_extraction", documentIds: [], editedAt },
        })}
      />
    );
    expect(screen.getByRole("status")).toHaveTextContent("Saved · Edited");
    expect(screen.getByText("Edited")).toHaveAttribute(
      "title",
      new Date(editedAt).toLocaleString()
    );
  });

  it("shows Couldn't save · Retry after a failed save, and Retry saves again", async () => {
    vi.useFakeTimers();
    saveData.mockRejectedValue(new Error("network down"));
    render(<SpreadsheetView note={makeNote()} />);
    editCell(1, 0, "Plum");
    await advance(800);
    expect(screen.getByRole("status")).toHaveTextContent("Couldn't save");

    saveData.mockResolvedValue(undefined);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await advance(0);
    expect(saveData).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("status")).toHaveTextContent("Saved · Edited");
  });

  it("opens fully quoted generated CSV without saving it", async () => {
    vi.useFakeTimers();
    render(<SpreadsheetView note={makeNote({ content: '"Name","Score"\n"Apple","3"' })} />);
    expect(cell(1, 0)).toHaveTextContent("Apple");
    await advance(5000);
    expect(saveData).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("is read-only while generating", () => {
    render(<SpreadsheetView note={makeNote({ status: "generating" })} />);
    expect(screen.getByRole("grid", { name: "Spreadsheet" })).toHaveAttribute(
      "aria-readonly",
      "true"
    );
    expect(screen.queryByRole("button", { name: /Add row/ })).toBeNull();
  });

  it("shows the failure alert and stays read-only for a failed note", () => {
    render(
      <SpreadsheetView
        note={makeNote({
          status: "failed",
          content: "{}",
          metadata: {
            spreadsheetType: "data_extraction",
            documentIds: [],
            error: { message: "Model timed out" } as unknown as string,
          },
        })}
      />
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Spreadsheet generation failed");
    expect(alert).toHaveTextContent("Model timed out");
    expect(screen.queryByRole("grid")).toBeNull();
    expect(screen.queryByRole("button", { name: /Add row/ })).toBeNull();
  });

  it("keeps showing a sheet whose only header was cleared, and saves it", async () => {
    const user = userEvent.setup();
    render(<SpreadsheetView note={makeNote({ content: "Name\nApple\nPear" })} />);
    await user.click(screen.getByRole("button", { name: /Name/ }));
    await user.click(await screen.findByRole("menuitem", { name: /Rename/ }));
    const editor = await screen.findByRole("textbox", { name: "Rename column Name" });
    await user.clear(editor);
    await user.keyboard("{Enter}");

    expect(screen.getByRole("grid", { name: "Spreadsheet" })).toBeInTheDocument();
    expect(cell(1, 0)).toHaveTextContent("Apple");
    expect(cell(2, 0)).toHaveTextContent("Pear");
    expect(screen.getByRole("button", { name: "Download CSV" })).toBeEnabled();
    await waitFor(() => expect(saveData).toHaveBeenCalledWith("s1", '""\nApple\nPear'), {
      timeout: 2000,
    });
  });

  it.each([
    ['""\nApple\nPear', "Apple"],
    [",\nApple,3", "Apple"],
    ["Name,Score\n,", ""],
  ])("shows the grid for blank-header content %j", (content, firstCell) => {
    render(<SpreadsheetView note={makeNote({ content })} />);
    expect(screen.getByRole("grid", { name: "Spreadsheet" })).toBeInTheDocument();
    expect(cell(1, 0)).toHaveTextContent(firstCell);
    expect(screen.getByRole("button", { name: "Download CSV" })).toBeEnabled();
  });

  // A sheet whose every cell was cleared is still a saved sheet: it stays editable, so the
  // user can type into it again instead of hitting a dead end.
  it.each(['""', ",,", ",\n,"])("keeps an all-blank saved sheet editable: %j", (content) => {
    render(<SpreadsheetView note={makeNote({ content })} />);
    expect(screen.getByRole("grid", { name: "Spreadsheet" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add row/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download CSV" })).toBeEnabled();
  });

  it.each(["", "   ", "{}", " {} "])("shows the empty state for content %j", (content) => {
    render(<SpreadsheetView note={makeNote({ content })} />);
    expect(screen.getByText("No data to display")).toBeInTheDocument();
    expect(screen.queryByRole("grid")).toBeNull();
  });

  it("shows a server change when nothing is pending, without saving it", async () => {
    vi.useFakeTimers();
    const { rerender } = render(<SpreadsheetView note={makeNote()} />);
    rerender(<SpreadsheetView note={makeNote({ content: '"Name","Score"\n"Kiwi","9"' })} />);
    expect(cell(1, 0)).toHaveTextContent("Kiwi");
    expect(cell(1, 1)).toHaveTextContent("9");
    await advance(5000);
    expect(saveData).not.toHaveBeenCalled();
  });

  it("keeps a pending local edit over a server change, then saves it", async () => {
    vi.useFakeTimers();
    const { rerender } = render(<SpreadsheetView note={makeNote()} />);
    editCell(1, 0, "Plum");
    rerender(<SpreadsheetView note={makeNote({ content: "Name,Score\nKiwi,9" })} />);
    expect(cell(1, 0)).toHaveTextContent("Plum");
    await advance(800);
    expect(saveData).toHaveBeenCalledWith("s1", "Name,Score\nPlum,3\nPear,5");
  });

  it("keeps an edit whose save failed over a server change, and retries it", async () => {
    vi.useFakeTimers();
    saveData.mockRejectedValueOnce(new Error("network down"));
    const { rerender } = render(<SpreadsheetView note={makeNote()} />);
    editCell(1, 0, "Plum");
    await advance(800);
    expect(screen.getByRole("status")).toHaveTextContent("Couldn't save");

    rerender(<SpreadsheetView note={makeNote({ content: "Name,Score\nKiwi,9" })} />);
    expect(cell(1, 0)).toHaveTextContent("Plum");
    await advance(3000);
    expect(saveData).toHaveBeenCalledTimes(2);
    expect(saveData).toHaveBeenLastCalledWith("s1", "Name,Score\nPlum,3\nPear,5");
  });

  it("lets a second (hidden) copy follow the first one's save without saving itself", async () => {
    vi.useFakeTimers();
    function Panels({ note }: { note: SpreadsheetNote }) {
      return (
        <>
          <section data-testid="desktop">
            <SpreadsheetView note={note} />
          </section>
          <section data-testid="mobile">
            <SpreadsheetView note={note} />
          </section>
        </>
      );
    }
    const { rerender } = render(<Panels note={makeNote()} />);
    const desktop = screen.getByTestId("desktop");
    const mobile = screen.getByTestId("mobile");

    editCell(1, 0, "Plum", desktop);
    await advance(800);
    expect(saveData).toHaveBeenCalledTimes(1);
    const saved = saveData.mock.calls[0][1];

    // The optimistic update patches the note both panels read.
    rerender(<Panels note={makeNote({ content: saved })} />);
    expect(cell(1, 0, mobile)).toHaveTextContent("Plum");
    await advance(5000);
    expect(saveData).toHaveBeenCalledTimes(1);
    expect(within(desktop).getByRole("status")).toHaveTextContent("Saved · Edited");
  });

  it("rolls back a rejected edit and reports the error", async () => {
    vi.useFakeTimers();
    const error = new ConvexError({ type: "INPUT_VALIDATION_ERROR", detail: "too big" });
    saveData.mockRejectedValue(error);
    render(<SpreadsheetView note={makeNote()} />);
    editCell(1, 0, "Plum");
    expect(cell(1, 0)).toHaveTextContent("Plum");
    await advance(800);
    expect(cell(1, 0)).toHaveTextContent("Apple");
    expect(showError).toHaveBeenCalledWith(error);
    await advance(5000);
    expect(saveData).toHaveBeenCalledTimes(1);
  });

  it("downloads the sheet as UTF-8 CSV with a BOM", async () => {
    const createObjectURL = vi.fn((_blob: Blob) => "blob:sheet");
    const revokeObjectURL = vi.fn();
    const original = { createObjectURL: URL.createObjectURL, revokeObjectURL: URL.revokeObjectURL };
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    let downloadName = "";
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      downloadName = this.download;
    });
    try {
      render(<SpreadsheetView note={makeNote({ title: 'Q3: "sales"/costs' })} />);
      fireEvent.click(screen.getByRole("button", { name: "Download CSV" }));

      expect(click).toHaveBeenCalledTimes(1);
      expect(downloadName).toBe("Q3- -sales--costs.csv");
      const blob = createObjectURL.mock.calls[0][0];
      expect(blob.type).toBe("text/csv;charset=utf-8");
      // Blob.text() strips a BOM, so decode the bytes with the BOM kept.
      const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(await blob.arrayBuffer());
      expect(text).toBe(`﻿${CSV}`);
    } finally {
      click.mockRestore();
      Object.assign(URL, original);
    }
  });

  it("calls onBack from the mobile back button", () => {
    const onBack = vi.fn();
    render(<SpreadsheetView note={makeNote()} onBack={onBack} />);
    fireEvent.click(screen.getByRole("button", { name: "Back to Studio" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
