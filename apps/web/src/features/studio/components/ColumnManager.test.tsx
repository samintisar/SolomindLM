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

  it("closes from its close button", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ColumnManager columns={COLUMNS} onChange={vi.fn()} onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Close column manager" }));
    expect(onClose).toHaveBeenCalled();
  });
});
