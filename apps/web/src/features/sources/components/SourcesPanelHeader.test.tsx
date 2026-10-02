import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ComponentProps, useState } from "react";
import { describe, expect, test, vi } from "vitest";
import type { Source } from "@/shared/types";
import { SourcesPanelHeader } from "./SourcesPanelHeader";

type HeaderProps = ComponentProps<typeof SourcesPanelHeader>;

const viewingSource: Source = {
  id: "doc-yt",
  title: "ML Lecture",
  type: "YOUTUBE",
  date: "2024-01-15",
  selected: true,
  status: "completed",
  url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
};

function makeProps(overrides: Partial<HeaderProps> = {}): HeaderProps {
  return {
    viewingSource,
    onBackToList: vi.fn(),
    onEnterRename: vi.fn(),
    onExitRename: vi.fn(),
    onClose: vi.fn(),
    selectedCount: 1,
    onCopy: vi.fn(),
    onDownload: vi.fn(),
    canCopyOrDownload: true,
    isRenaming: false,
    renameValue: viewingSource.title,
    onRenameChange: vi.fn(),
    onRenameSubmit: vi.fn(),
    ...overrides,
  };
}

function renderHeader(overrides: Partial<HeaderProps> = {}) {
  const props = makeProps(overrides);
  render(<SourcesPanelHeader {...props} />);
  return props;
}

/** Owns the rename state like SourcesPanel does, so the input really mounts and unmounts. */
// biome-ignore lint/style/useComponentExportOnlyModules: test-only harness
function Harness({ spies }: { spies: HeaderProps }) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [value, setValue] = useState(viewingSource.title);
  return (
    <SourcesPanelHeader
      {...spies}
      isRenaming={isRenaming}
      renameValue={value}
      onRenameChange={(v) => {
        spies.onRenameChange(v);
        setValue(v);
      }}
      onEnterRename={() => {
        spies.onEnterRename();
        setIsRenaming(true);
      }}
      onExitRename={() => {
        spies.onExitRename();
        setIsRenaming(false);
      }}
      onRenameSubmit={(id, title) => {
        spies.onRenameSubmit(id, title);
        setIsRenaming(false);
      }}
    />
  );
}

function renderHarness() {
  const spies = makeProps();
  render(<Harness spies={spies} />);
  return spies;
}

async function startRename() {
  await userEvent.click(screen.getByRole("button", { name: "Rename ML Lecture" }));
  return screen.getByRole("textbox", { name: "Rename source" });
}

describe("SourcesPanelHeader viewer mode", () => {
  test("renders one back button and one external link", () => {
    renderHeader();

    expect(screen.getAllByRole("button", { name: "Back to sources" })).toHaveLength(1);
    const link = screen.getByRole("link", { name: "Open source in new tab" });
    expect(link).toHaveAttribute("href", "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  test("hides external link when YouTube source has no url", () => {
    renderHeader({ viewingSource: { ...viewingSource, url: undefined } });

    expect(screen.queryByRole("link", { name: "Open source in new tab" })).not.toBeInTheDocument();
  });

  test("goes back to the list", async () => {
    const p = renderHeader();
    await userEvent.click(screen.getByRole("button", { name: "Back to sources" }));
    expect(p.onBackToList).toHaveBeenCalledTimes(1);
  });

  test("copy and download call their handlers", async () => {
    const p = renderHeader();
    await userEvent.click(screen.getByRole("button", { name: "Copy content as Markdown" }));
    await userEvent.click(screen.getByRole("button", { name: "Download as Markdown file" }));
    expect(p.onCopy).toHaveBeenCalledTimes(1);
    expect(p.onDownload).toHaveBeenCalledTimes(1);
  });

  test("disables copy and download when there is nothing to copy", () => {
    renderHeader({ canCopyOrDownload: false });

    expect(screen.getByRole("button", { name: "Copy content as Markdown" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Download as Markdown file" })).toBeDisabled();
  });
});

describe("SourcesPanelHeader rename", () => {
  test("clicking the title swaps it for a textbox", async () => {
    const p = renderHarness();
    const input = await startRename();

    expect(input).toHaveValue("ML Lecture");
    expect(input).toHaveFocus();
    expect(p.onEnterRename).toHaveBeenCalledTimes(1);
  });

  test("Enter submits the trimmed new title once and returns focus to the title", async () => {
    const p = renderHarness();
    const input = await startRename();

    await userEvent.clear(input);
    await userEvent.type(input, "New title");
    await userEvent.keyboard("{Enter}");

    expect(p.onRenameSubmit).toHaveBeenCalledTimes(1);
    expect(p.onRenameSubmit).toHaveBeenCalledWith("doc-yt", "New title");
    expect(screen.queryByRole("textbox", { name: "Rename source" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rename ML Lecture" })).toHaveFocus();
  });

  test("Escape reverts, submits nothing and returns focus to the title", async () => {
    const p = renderHarness();
    const input = await startRename();

    await userEvent.clear(input);
    await userEvent.type(input, "Something else");
    await userEvent.keyboard("{Escape}");

    expect(p.onRenameSubmit).not.toHaveBeenCalled();
    expect(p.onExitRename).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Rename ML Lecture" })).toHaveFocus();
  });

  test("the blur after Enter does not submit a second time", async () => {
    const p = renderHarness();
    const input = await startRename();

    await userEvent.clear(input);
    await userEvent.type(input, "New title");
    await userEvent.keyboard("{Enter}");
    // jsdom does not fire blur when focus is moved by an unmount; do it explicitly.
    input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    input.blur();

    expect(p.onRenameSubmit).toHaveBeenCalledTimes(1);
  });

  test("the blur after Escape does not submit", async () => {
    const p = renderHarness();
    const input = await startRename();

    await userEvent.clear(input);
    await userEvent.type(input, "Something else");
    await userEvent.keyboard("{Escape}");
    input.blur();

    expect(p.onRenameSubmit).not.toHaveBeenCalled();
  });

  test("blurring with a changed value submits it", async () => {
    const p = renderHarness();
    const input = await startRename();

    await userEvent.clear(input);
    await userEvent.type(input, "New title");
    await userEvent.tab();

    expect(p.onRenameSubmit).toHaveBeenCalledTimes(1);
    expect(p.onRenameSubmit).toHaveBeenCalledWith("doc-yt", "New title");
  });

  test("blurring with an empty value cancels", async () => {
    const p = renderHarness();
    const input = await startRename();

    await userEvent.clear(input);
    await userEvent.tab();

    expect(p.onRenameSubmit).not.toHaveBeenCalled();
    expect(p.onExitRename).toHaveBeenCalledTimes(1);
  });

  test("an unchanged value counts as a cancel", async () => {
    const p = renderHarness();
    await startRename();

    await userEvent.keyboard("{Enter}");

    expect(p.onRenameSubmit).not.toHaveBeenCalled();
    expect(p.onExitRename).toHaveBeenCalledTimes(1);
  });
});

describe("SourcesPanelHeader list mode", () => {
  test("shows the title with a count badge and a close button", async () => {
    const p = renderHeader({ viewingSource: null, selectedCount: 3 });

    expect(screen.getByText("Sources")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Close sources panel" }));
    expect(p.onClose).toHaveBeenCalledTimes(1);
  });
});
