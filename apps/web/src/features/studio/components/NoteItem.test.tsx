import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import type { Note } from "@/shared/types/index";
import { NoteItem } from "./NoteItem";

const note = (fields: Record<string, unknown> = {}) =>
  ({
    id: "n1",
    type: "flashcard",
    title: "SQL Joins",
    preview: "8 Flashcards · Medium",
    status: "completed",
    metadata: {},
    ...fields,
  }) as unknown as Note;

const handlers = () => ({
  onEditTitleChange: vi.fn(),
  onEditStart: vi.fn(),
  onEditSave: vi.fn(),
  onEditCancel: vi.fn(),
  onEditKeyDown: vi.fn(),
  onClick: vi.fn(),
  onDelete: vi.fn(),
});

function renderItem(n: Note, extra: Partial<React.ComponentProps<typeof NoteItem>> = {}) {
  const h = handlers();
  render(<NoteItem note={n} isEditing={false} editTitle="" {...h} {...extra} />);
  return h;
}

describe("NoteItem", () => {
  it("opens the note when its row is clicked", async () => {
    const h = renderItem(note());
    await userEvent.click(screen.getByRole("button", { name: /SQL Joins/ }));
    expect(h.onClick).toHaveBeenCalledOnce();
  });

  it("shows the current step and a determinate bar while generating", () => {
    renderItem(
      note({
        status: "generating",
        metadata: { currentStep: "Drafting cards 2 of 8", progress: 40 },
      })
    );
    expect(screen.getByTestId("studio-note-card")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Drafting cards 2 of 8")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Generation progress" })).toHaveAttribute(
      "aria-valuenow",
      "40"
    );
    expect(screen.queryByRole("button", { name: /SQL Joins/ })).not.toBeInTheDocument();
  });

  it("sweeps an indeterminate bar before the job reports a percentage", () => {
    renderItem(note({ status: "generating", metadata: {} }));
    expect(screen.getByRole("progressbar", { name: "Generation progress" })).toHaveAttribute(
      "data-state",
      "indeterminate"
    );
  });

  it("deletes from the menu", async () => {
    const h = renderItem(note());
    await userEvent.click(screen.getByRole("button", { name: "More options" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(h.onDelete).toHaveBeenCalledOnce();
  });

  it("marks the open menu for the e2e helpers", async () => {
    renderItem(note());
    await userEvent.click(screen.getByRole("button", { name: "More options" }));
    const menu = document.querySelector("[data-note-item-menu]");
    expect(menu).not.toBeNull();
    expect(menu).toHaveTextContent("Rename");
    expect(menu).toHaveTextContent("Delete");
  });

  it("keeps focus in the title input after choosing Rename", async () => {
    function Harness() {
      const [editing, setEditing] = React.useState(false);
      const [title, setTitle] = React.useState("SQL Joins");
      return (
        <NoteItem
          note={note()}
          isEditing={editing}
          editTitle={title}
          {...handlers()}
          onEditStart={() => setEditing(true)}
          onEditTitleChange={setTitle}
        />
      );
    }
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "More options" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
    expect(screen.getByRole("textbox", { name: "Edit note title" })).toHaveFocus();
  });

  it("offers inline play for a finished audio overview", async () => {
    const onPlayAudio = vi.fn();
    renderItem(note({ type: "audioOverview", audioUrl: "https://x/a.mp3" }), { onPlayAudio });
    await userEvent.click(screen.getByRole("button", { name: "Play audio overview" }));
    expect(onPlayAudio).toHaveBeenCalledOnce();
  });
});
