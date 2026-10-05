import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type React from "react";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import type { SrsRating } from "@/features/studio/utils/srsReviewLabels";
import type { Flashcard } from "@/shared/types";
import { type DueFlashcard, StudyMode } from "./StudyMode";

vi.mock("@/shared/components/MarkdownRenderer", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

function deck(n: number): DueFlashcard[] {
  return Array.from({ length: n }, (_, i) => ({
    index: i,
    card: { front: `Front ${i + 1}`, back: `Back ${i + 1}`, type: "basic" } as unknown as Flashcard,
  }));
}

let onRateCard: Mock<(cardIndex: number, rating: SrsRating) => Promise<void>>;
let onComplete: Mock<() => void>;
beforeEach(() => {
  onRateCard = vi
    .fn<(cardIndex: number, rating: SrsRating) => Promise<void>>()
    .mockResolvedValue(undefined);
  onComplete = vi.fn<() => void>();
});

function renderStudy(n = 3) {
  return render(
    <StudyMode cards={deck(n)} onRateCard={onRateCard} onComplete={onComplete} onExit={() => {}} />
  );
}

async function reveal(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Reveal answer" }));
}

async function rate(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
  await reveal(user);
  await user.click(screen.getByRole("button", { name }));
}

describe("StudyMode", () => {
  it("reveals, then offers four ratings with their next interval", async () => {
    const user = userEvent.setup();
    renderStudy();
    await reveal(user);
    expect(screen.getByRole("button", { name: /Again\s+in 1 min/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Hard\s+in 6 min/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Good\s+in 10 min/ })).toHaveFocus();
    expect(screen.getByRole("button", { name: /Easy\s+in 4 days/ })).toBeInTheDocument();
  });

  it("rating moves to the next card and counts it", async () => {
    const user = userEvent.setup();
    renderStudy();
    await rate(user, /Good/);
    expect(onRateCard).toHaveBeenCalledWith(0, "good");
    expect(await screen.findByText("Front 2")).toBeInTheDocument();
    expect(screen.getByText("1 of 3 reviewed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reveal answer" })).toHaveFocus();
  });

  it("throws the rated card in the rating's direction", async () => {
    const user = userEvent.setup();
    const { container } = renderStudy();
    await rate(user, /Again/);
    const thrown = await waitFor(() => {
      const el = container.querySelector("[data-thrown]");
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    expect(thrown).toHaveAttribute("data-rating", "again");
    expect(thrown).toHaveTextContent("Back 1");
  });

  it("keyboard: Space reveals and 3 rates Good", async () => {
    const user = userEvent.setup();
    renderStudy();
    await screen.findByText("Front 1");
    // Focus is on the page body, so the key reaches the window handler.
    await user.keyboard(" ");
    expect(screen.getByRole("button", { name: /Good\s+in 10 min/ })).toBeInTheDocument();
    await user.keyboard("3");
    await waitFor(() => expect(onRateCard).toHaveBeenCalledWith(0, "good"));
  });

  it("ignores number keys until the answer is showing", async () => {
    const user = userEvent.setup();
    renderStudy();
    await screen.findByText("Front 1");
    await user.keyboard("3");
    expect(onRateCard).not.toHaveBeenCalled();
  });

  it("shows a streak after two Good ratings", async () => {
    const user = userEvent.setup();
    renderStudy();
    await rate(user, /Good/);
    await screen.findByText("Front 2");
    await rate(user, /Good/);
    await screen.findByText("Front 3");
    expect(screen.getByRole("status")).toHaveTextContent("2 in a row");
  });

  it("completes with a per-rating tally and the same stats as before", async () => {
    const user = userEvent.setup();
    renderStudy();
    await rate(user, /Again/);
    await screen.findByText("Front 2");
    await rate(user, /Hard/);
    await screen.findByText("Front 3");
    await rate(user, /Good/);

    expect(await screen.findByText("Session complete")).toBeInTheDocument();
    expect(onComplete).toHaveBeenCalledWith({
      reviewed: 3,
      correct: 2,
      incorrect: 1,
      longestStreak: 2,
    });
    for (const [label, count] of [
      ["Again", "1"],
      ["Hard", "1"],
      ["Good", "1"],
      ["Easy", "0"],
    ] as const) {
      const tile = screen.getByText(label).parentElement as HTMLElement;
      await waitFor(() => expect(within(tile).getByText(count)).toBeInTheDocument());
    }
  });

  it("Study again resets the session", async () => {
    const user = userEvent.setup();
    renderStudy(1);
    await rate(user, /Easy/);
    await user.click(await screen.findByRole("button", { name: "Study again" }));
    expect(screen.getByText("0 of 1 reviewed")).toBeInTheDocument();
    expect(await screen.findByText("Front 1")).toBeInTheDocument();
  });

  it("the peeking cards are blank", async () => {
    const { container } = renderStudy(3);
    await screen.findByText("Front 1");
    const peeks = container.querySelectorAll("[data-peek]");
    expect(peeks).toHaveLength(2);
    for (const peek of peeks) {
      expect(peek).toHaveAttribute("aria-hidden", "true");
      expect(peek).toHaveTextContent("");
    }
    expect(screen.getAllByText("Front 1")).toHaveLength(1);
  });
});
