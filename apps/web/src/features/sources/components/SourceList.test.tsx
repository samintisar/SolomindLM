import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ComponentProps, useState } from "react";
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

const three: Source[] = ["a", "b", "c"].map((id) => ({
  ...source,
  id,
  title: `Source ${id}`,
}));

type ListProps = ComponentProps<typeof SourceList>;

function props(overrides: Partial<ListProps> = {}): ListProps {
  return {
    sources: three,
    filteredSources: three,
    searchQuery: "",
    onSearchChange: vi.fn(),
    onToggleAll: vi.fn(),
    onToggleSource: vi.fn(),
    onViewSource: vi.fn(),
    onDeleteSource: vi.fn(),
    onRefreshSource: vi.fn(),
    onRenameSource: vi.fn(),
    allSelected: false,
    renamingId: null,
    renameValue: "",
    onRenameChange: vi.fn(),
    openMenuId: null,
    onMenuOpenChange: vi.fn(),
    onRenameCancel: vi.fn(),
    onStartRename: vi.fn(),
    onAddSource: vi.fn(),
    onDiscoverClick: vi.fn(),
    selectedCount: 0,
    onDeleteSelected: vi.fn(),
    onRefreshAll: vi.fn(),
    canRefreshAll: true,
    isRefreshing: false,
    ...overrides,
  };
}

describe("SourceList actions, search and empty states", () => {
  it("disables bulk actions when they can't run", () => {
    render(<SourceList {...props({ selectedCount: 0, canRefreshAll: false })} />);
    expect(screen.getByRole("button", { name: /Delete selected/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Refresh all/ })).toBeDisabled();
    const add = screen.getByRole("button", { name: /Add source/i });
    expect(add).toHaveAttribute("data-onboarding", "add-source-button");
    expect(add).toHaveAttribute("title", "Add Source");
  });

  it("shows the selection count and toggles all", async () => {
    const p = props({
      selectedCount: 2,
      sources: three,
      filteredSources: three,
      allSelected: false,
    });
    render(<SourceList {...p} />);
    expect(screen.getByText("2 of 3 selected")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Select all" }));
    expect(p.onToggleAll).toHaveBeenCalled();
  });

  it("renders rows in one grouped list", () => {
    render(<SourceList {...props({ sources: three, filteredSources: three })} />);
    expect(screen.getByRole("list")).toHaveAttribute("data-variant", "grouped");
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
  });

  it("invites adding a first source when empty", async () => {
    const p = props({ sources: [], filteredSources: [] });
    render(<SourceList {...p} />);
    expect(screen.getByText("Add your first source")).toBeInTheDocument();
    const add = screen.getByRole("button", { name: /Add source/i });
    expect(add).toHaveAttribute("data-onboarding", "add-source-button");
    expect(add).toHaveAttribute("title", "Add Source");
    expect(screen.queryByRole("searchbox", { name: "Search sources" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Source actions" })).not.toBeInTheDocument();
    await userEvent.click(add);
    expect(p.onAddSource).toHaveBeenCalledOnce();
  });

  it("keeps the count but hides select all when a search matches nothing", () => {
    render(<SourceList {...props({ sources: three, filteredSources: [], searchQuery: "zzz" })} />);
    expect(screen.getByText("0 of 3 selected")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /select all/i })).not.toBeInTheDocument();
  });

  it("calls the discover and refresh handlers", async () => {
    const p = props({ canRefreshAll: true });
    render(<SourceList {...p} />);
    await userEvent.click(screen.getByRole("button", { name: "Discover sources" }));
    expect(p.onDiscoverClick).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("button", { name: "Refresh all" }));
    expect(p.onRefreshAll).toHaveBeenCalledOnce();
  });

  it("disables refresh and shows a spinner while refreshing", () => {
    render(<SourceList {...props({ canRefreshAll: true, isRefreshing: true })} />);
    const refresh = screen.getByRole("button", { name: "Refresh all" });
    expect(refresh).toBeDisabled();
    expect(within(refresh).getByRole("status")).toBeInTheDocument();
  });

  it("explains when a search matches nothing", () => {
    render(<SourceList {...props({ sources: three, filteredSources: [], searchQuery: "zzz" })} />);
    expect(screen.getByText("No sources match your search.")).toBeInTheDocument();
    expect(screen.queryByText("Add your first source")).not.toBeInTheDocument();
  });

  it("reports search input changes", async () => {
    const p = props({ sources: three, filteredSources: three });
    render(<SourceList {...p} />);
    await userEvent.type(screen.getByRole("searchbox", { name: "Search sources" }), "q");
    expect(p.onSearchChange).toHaveBeenCalledWith("q");
  });
});
