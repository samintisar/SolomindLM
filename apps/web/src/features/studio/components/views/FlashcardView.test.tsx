import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Flashcard, FlashcardNote } from "@/shared/types/index";
import { FlashcardView } from "./FlashcardView";

let due: { index: number; card: Flashcard }[] = [];
const noop = vi.fn().mockResolvedValue(undefined);
const updateCard = vi.fn().mockResolvedValue(undefined);

vi.mock("@/features/studio/services/flashcardsApi", () => ({
  useFlashcard: () => null,
  useDueCards: () => due,
  useAddCard: () => noop,
  useUpdateCard: () => updateCard,
  useDeleteCard: () => noop,
  useCardReview: () => noop,
  useUpdateFlashcardPreferences: () => noop,
  useUpdateFlashcardProgress: () => undefined,
}));

vi.mock("@/shared/contexts/useToast", () => ({
  useToast: () => ({ error: vi.fn() }),
}));

vi.mock("@/shared/components/MarkdownRenderer", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

function makeCards(): Flashcard[] {
  return [
    { front: "Front 1", back: "Back 1", type: "basic" },
    { front: "Front 2", back: "Back 2", type: "basic" },
  ] as unknown as Flashcard[];
}

function makeNote(showMastered = false, flashcards = makeCards()): FlashcardNote {
  return {
    id: "fc1",
    title: "Deck",
    preview: "",
    type: "flashcards",
    status: "completed",
    flashcards,
    metadata: { showMastered },
  } as unknown as FlashcardNote;
}

beforeEach(() => {
  vi.clearAllMocks();
  due = makeCards().map((card, index) => ({ index, card }));
});

describe("FlashcardView", () => {
  it("shows the first card and flips it on click", async () => {
    const user = userEvent.setup();
    const { container } = render(<FlashcardView note={makeNote()} />);
    expect(await screen.findByText("Front 1")).toBeInTheDocument();
    expect(screen.getByText("1 of 2")).toBeInTheDocument();
    const back = container.querySelector('[data-face="back"]');
    expect(back).toHaveAttribute("data-shown", "false");
    await user.click(screen.getByRole("button", { name: /Flashcard question/ }));
    expect(back).toHaveAttribute("data-shown", "true");
  });

  it("disables Study Mode with nothing due, and starts a session when there is", async () => {
    const user = userEvent.setup();
    due = [];
    const { unmount } = render(<FlashcardView note={makeNote()} />);
    expect(screen.getByRole("button", { name: "Study Mode" })).toBeDisabled();
    unmount();

    due = makeCards().map((card, index) => ({ index, card }));
    render(<FlashcardView note={makeNote()} />);
    await user.click(screen.getByRole("button", { name: "Study Mode" }));
    expect(await screen.findByRole("button", { name: "Reveal answer" })).toBeInTheDocument();
  });

  it("opens the edit dialog from a card in Edit Mode", async () => {
    const user = userEvent.setup();
    render(<FlashcardView note={makeNote()} />);
    await user.click(screen.getByRole("button", { name: "Edit Mode" }));
    await user.click(await screen.findByText("Front 1"));
    const dialog = await screen.findByRole("dialog", { name: "Edit Card" });
    expect(within(dialog).getByLabelText("Front (question)")).toHaveValue("Front 1");
  });

  it("reflects the show-mastered preference on the Due and All toggles", () => {
    const { unmount } = render(<FlashcardView note={makeNote(false)} />);
    expect(screen.getByRole("button", { name: "Due" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "false");
    unmount();
    render(<FlashcardView note={makeNote(true)} />);
    expect(screen.getByRole("button", { name: "Due" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
  });

  it("puts the mode and Due/All toggles directly in a tray group so the pressed look applies", () => {
    render(<FlashcardView note={makeNote()} />);
    const modeGroup = screen.getByRole("group", { name: "Mode" });
    const browse = screen.getByRole("button", { name: "Browse Mode" });
    expect(browse).toHaveAttribute("aria-pressed", "true");
    expect(browse.parentElement).toBe(modeGroup);
    expect(modeGroup).toHaveAttribute("data-variant", "tray");
    const dueAll = screen.getByRole("group", { name: "Which cards to show" });
    expect(dueAll).toHaveAttribute("data-variant", "tray");
    expect(screen.getByRole("button", { name: "Due" }).parentElement).toBe(dueAll);
  });

  it("does not restart the session when the active mode toggle is pressed again", async () => {
    const user = userEvent.setup();
    render(<FlashcardView note={makeNote()} />);
    await user.click(screen.getByRole("button", { name: "Study Mode" }));
    await user.click(await screen.findByRole("button", { name: "Reveal answer" }));
    await user.click(screen.getByRole("button", { name: "Study Mode" }));
    expect(screen.queryByRole("button", { name: "Reveal answer" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Again/ })).toBeInTheDocument();
  });

  it("saves an edit against the card's index in the full deck, not the filtered one", async () => {
    const user = userEvent.setup();
    const cards = [
      {
        front: "Mastered front",
        back: "Mastered back",
        type: "basic",
        proficiency: { interval: 30 },
      },
      { front: "Visible front", back: "Visible back", type: "basic" },
    ] as unknown as Flashcard[];
    render(<FlashcardView note={makeNote(false, cards)} />);
    await user.click(screen.getByRole("button", { name: "Edit Mode" }));
    expect(screen.queryByText("Mastered front")).not.toBeInTheDocument();
    await user.click(await screen.findByText("Visible front"));
    const dialog = await screen.findByRole("dialog", { name: "Edit Card" });
    await user.type(within(dialog).getByLabelText("Back (answer)"), " edited");
    await user.click(within(dialog).getByRole("button", { name: "Save Changes" }));
    expect(updateCard).toHaveBeenCalledWith("fc1", 1, {
      front: "Visible front",
      back: "Visible back edited",
    });
  });
});
