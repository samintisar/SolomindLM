import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Source } from "@/shared/types";
import { SourceListItem } from "./SourceListItem";

const base: Source = {
  id: "s1",
  title: "SQL cheatsheet",
  type: "MD",
  date: "Jan 30",
  selected: true,
  status: "completed",
};

function setup(
  overrides: Partial<React.ComponentProps<typeof SourceListItem>> = {},
  source: Partial<Source> = {}
) {
  const props = {
    source: { ...base, ...source },
    isRenaming: false,
    renameValue: "",
    onRenameChange: vi.fn(),
    onRenameSubmit: vi.fn(),
    onRenameCancel: vi.fn(),
    onToggle: vi.fn(),
    onView: vi.fn(),
    onDelete: vi.fn(),
    onRefreshSource: vi.fn(),
    onMenuOpen: vi.fn(),
    onStartRename: vi.fn(),
    isMenuOpen: false,
    ...overrides,
  };
  render(<SourceListItem {...props} />);
  return props;
}

describe("SourceListItem", () => {
  it("opens the source from its main button, by click and keyboard", async () => {
    const p = setup();
    const open = screen.getByRole("button", { name: /SQL cheatsheet/ });
    await userEvent.click(open);
    open.focus();
    await userEvent.keyboard("{Enter}");
    expect(p.onView).toHaveBeenCalledTimes(2);
    expect(p.onView).toHaveBeenCalledWith("s1");
  });

  it("can't be opened while processing, and says so", () => {
    setup({}, { status: "processing" });
    expect(screen.getByRole("button", { name: /SQL cheatsheet/ })).toBeDisabled();
    expect(screen.getByText("Processing")).toBeInTheDocument();
  });

  it("shows Failed for failed sources", () => {
    setup({}, { status: "failed" });
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  it("toggles chat inclusion with a labelled checkbox", async () => {
    const p = setup();
    const box = screen.getByRole("checkbox", { name: "Include SQL cheatsheet in chat" });
    expect(box).toBeChecked();
    await userEvent.click(box);
    expect(p.onToggle).toHaveBeenCalledWith("s1");
    expect(p.onView).not.toHaveBeenCalled();
  });

  it("offers rename and delete in its menu", async () => {
    const p = setup({ isMenuOpen: true });
    expect(screen.getByRole("button", { name: "More options" })).toHaveAttribute(
      "title",
      "More options"
    );
    await userEvent.click(await screen.findByRole("menuitem", { name: "Rename" }));
    expect(p.onStartRename).toHaveBeenCalledWith("s1");
    expect(screen.queryByRole("menuitem", { name: "Refresh" })).not.toBeInTheDocument();
  });

  it("deletes through the menu", async () => {
    const p = setup({ isMenuOpen: true });
    await userEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
    expect(p.onDelete).toHaveBeenCalledWith("s1", "SQL cheatsheet");
  });

  it("refreshes remote sources through the menu", async () => {
    const p = setup({ isMenuOpen: true }, { type: "WEB", remoteRefreshKind: "url" });
    await userEvent.click(await screen.findByRole("menuitem", { name: "Refresh" }));
    expect(p.onRefreshSource).toHaveBeenCalledWith("s1");
  });

  it("asks to open its menu from the trigger", async () => {
    const p = setup();
    await userEvent.click(screen.getByRole("button", { name: "More options" }));
    expect(p.onMenuOpen).toHaveBeenCalledWith("s1");
  });

  it("renames inline: Enter submits trimmed, Escape cancels", async () => {
    const p = setup({ isRenaming: true, renameValue: "  New  " });
    const input = screen.getByRole("textbox", { name: "Rename source" });
    expect(input).toHaveFocus();
    await userEvent.type(input, "{Enter}");
    expect(p.onRenameSubmit).toHaveBeenCalledWith("s1", "New");
    await userEvent.type(input, "{Escape}");
    expect(p.onRenameCancel).toHaveBeenCalled();
  });
});
