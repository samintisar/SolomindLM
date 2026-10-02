import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Source } from "@/shared/types";
import { SourceList } from "./SourceList";

const source: Source = {
  id: "s1",
  title: "SQL cheatsheet",
  type: "MD",
  date: "Jan 30",
  selected: true,
  status: "completed",
};

/** Mirrors the rename/menu state and handlers of SourcesPanel. */
function Harness({ onRenameSource }: { onRenameSource: (id: string, title: string) => void }) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  return (
    <SourceList
      sources={[source]}
      filteredSources={[source]}
      searchQuery=""
      onSearchChange={vi.fn()}
      onToggleAll={vi.fn()}
      onToggleSource={vi.fn()}
      onViewSource={vi.fn()}
      onDeleteSource={vi.fn()}
      onRefreshSource={vi.fn()}
      onRenameSource={(id, title) => {
        onRenameSource(id, title);
        setRenamingId(null);
      }}
      allSelected={false}
      renamingId={renamingId}
      renameValue={renameValue}
      onRenameChange={setRenameValue}
      openMenuId={openMenuId}
      onMenuOpenChange={(id, open) =>
        setOpenMenuId(open ? id : (prev) => (prev === id ? null : prev))
      }
      onRenameCancel={() => {
        setRenamingId(null);
        setRenameValue("");
      }}
      onStartRename={(id) => {
        setRenamingId(id);
        setRenameValue(source.title);
        setOpenMenuId(null);
      }}
      onAddSource={vi.fn()}
      onDiscoverClick={vi.fn()}
      selectedCount={1}
      onDeleteSelected={vi.fn()}
      onRefreshAll={vi.fn()}
      canRefreshAll={false}
      isRefreshing={false}
    />
  );
}

async function startRename() {
  await userEvent.click(screen.getByRole("button", { name: "More options" }));
  await userEvent.click(await screen.findByRole("menuitem", { name: "Rename" }));
  const input = await screen.findByRole("textbox", { name: "Rename source" });
  expect(input).toHaveFocus();
  return input;
}

describe("SourceList rename and menu flow", () => {
  it("Escape cancels the rename without saving", async () => {
    const onRename = vi.fn();
    render(<Harness onRenameSource={onRename} />);
    const input = await startRename();
    await userEvent.type(input, "X{Escape}");
    expect(onRename).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox", { name: "Rename source" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "More options" })).toHaveFocus();
  });

  it("Enter saves once and returns focus to the menu trigger", async () => {
    const onRename = vi.fn();
    render(<Harness onRenameSource={onRename} />);
    const input = await startRename();
    await userEvent.type(input, "X{Enter}");
    expect(onRename).toHaveBeenCalledOnce();
    expect(onRename).toHaveBeenCalledWith("s1", "SQL cheatsheetX");
    expect(screen.queryByRole("textbox", { name: "Rename source" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "More options" })).toHaveFocus();
    // Moving focus away afterwards must not submit a second time.
    await userEvent.tab();
    expect(onRename).toHaveBeenCalledOnce();
  });

  it("closes its menu on Escape and can reopen it", async () => {
    render(<Harness onRenameSource={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: "More options" });
    await userEvent.click(trigger);
    expect(await screen.findByRole("menuitem", { name: "Rename" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menuitem", { name: "Rename" })).not.toBeInTheDocument();
    await userEvent.click(trigger);
    expect(await screen.findByRole("menuitem", { name: "Rename" })).toBeInTheDocument();
  });
});
