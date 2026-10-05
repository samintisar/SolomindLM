import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Flashcard, FlashcardNote } from "@/shared/types/index";
import { FlashcardView } from "./FlashcardView";

let due: { index: number; card: Flashcard }[] = [];
const noop = vi.fn().mockResolvedValue(undefined);

vi.mock("@/features/studio/services/flashcardsApi", () => ({
  useFlashcard: () => null,
  useDueCards: () => due,
  useAddCard: () => noop,
  useUpdateCard: () => noop,
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

function makeNote(showMastered = false): FlashcardNote {
  return {
    id: "fc1",
    title: "Deck",
    preview: "",
    type: "flashcards",
    status: "completed",
    flashcards: makeCards(),
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
});
