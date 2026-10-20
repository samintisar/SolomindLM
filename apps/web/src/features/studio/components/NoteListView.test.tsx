import { render, screen } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { STUDIO_TOOLS } from "@/shared/constants";
import type { Note } from "@/shared/types/index";
import { NoteListView } from "./NoteListView";

const note = {
  id: "n1",
  type: "flashcard",
  title: "SQL Joins",
  preview: "8 Flashcards",
  status: "completed",
  metadata: {},
} as unknown as Note;

function renderList(extra: Partial<React.ComponentProps<typeof NoteListView>> = {}) {
  render(
    <NoteListView
      tools={STUDIO_TOOLS}
      notes={[note]}
      activeNoteId={null}
      onToolClick={vi.fn()}
      onNoteClick={vi.fn()}
      onDeleteNote={vi.fn()}
      editingId={null}
      editTitle=""
      onEditTitleChange={vi.fn()}
      onEditStart={vi.fn()}
      onEditSave={vi.fn()}
      onEditKeyDown={vi.fn()}
      {...extra}
    />
  );
}

describe("NoteListView", () => {
  it("offers the Studio tools and each item's menu", () => {
    renderList();
    expect(screen.getByRole("button", { name: "Reports" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "More options" })).toBeInTheDocument();
  });

  it("read-only lists items without the tools or item menus", () => {
    renderList({ readOnly: true });
    expect(screen.queryByRole("button", { name: "Reports" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "More options" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /SQL Joins/ })).toBeInTheDocument();
  });

  it("read-only explains an empty Studio", () => {
    renderList({ readOnly: true, notes: [] });
    expect(screen.getByText("No Studio items in this notebook.")).toBeInTheDocument();
  });
});
