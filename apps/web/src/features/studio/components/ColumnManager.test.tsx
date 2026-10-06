import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ColumnManager, type TableColumn } from "./ColumnManager";

const COLUMNS: TableColumn[] = [
  { id: "title", name: "Title", type: "paper_title", isVisible: true, isSystem: true, order: 0 },
  { id: "method", name: "Method", type: "custom", isVisible: true, isSystem: false, order: 1 },
];

describe("ColumnManager", () => {
  it("toggles a column with its switch", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ColumnManager columns={COLUMNS} onChange={onChange} />);
    const toggle = screen.getByRole("switch", { name: "Toggle Method" });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    await user.click(toggle);
    expect(onChange).toHaveBeenCalledWith([COLUMNS[0], { ...COLUMNS[1], isVisible: false }]);
  });

  it("adds a custom column from the labelled form", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ColumnManager columns={COLUMNS} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Add Column" }));
    await user.type(screen.getByLabelText("Column name"), "Sample size");
    await user.type(screen.getByLabelText(/Instructions/), "Number of participants");
    await user.click(screen.getByRole("button", { name: "Add column" }));
    const added = onChange.mock.calls[0][0].at(-1);
    expect(added).toMatchObject({
      name: "Sample size",
      instructions: "Number of participants",
      type: "custom",
      isVisible: true,
      order: 2,
    });
  });

  it("focuses the name field when the form opens", async () => {
    const user = userEvent.setup();
    render(<ColumnManager columns={COLUMNS} onChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Add Column" }));
    expect(screen.getByLabelText("Column name")).toHaveFocus();
  });

  it("adds the column when Enter is pressed in the name field", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ColumnManager columns={COLUMNS} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Add Column" }));
    await user.type(screen.getByLabelText("Column name"), "Sample size{Enter}");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].at(-1)).toMatchObject({ name: "Sample size" });
    expect(screen.getByRole("button", { name: "Add Column" })).toHaveFocus();
  });

  it("disables Add column for a whitespace-only name", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ColumnManager columns={COLUMNS} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Add Column" }));
    await user.type(screen.getByLabelText("Column name"), "   {Enter}");
    expect(screen.getByRole("button", { name: "Add column" })).toBeDisabled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("clears the form on Cancel and returns focus to Add Column", async () => {
    const user = userEvent.setup();
    render(<ColumnManager columns={COLUMNS} onChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Add Column" }));
    await user.type(screen.getByLabelText("Column name"), "Draft");
    await user.type(screen.getByLabelText(/Instructions/), "Some notes");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Add Column" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Add Column" }));
    expect(screen.getByLabelText("Column name")).toHaveValue("");
    expect(screen.getByLabelText(/Instructions/)).toHaveValue("");
  });

  it("closes from its close button", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ColumnManager columns={COLUMNS} onChange={vi.fn()} onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Close column manager" }));
    expect(onClose).toHaveBeenCalled();
  });
});
