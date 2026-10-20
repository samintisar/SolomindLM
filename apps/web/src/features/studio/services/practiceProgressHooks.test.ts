// @vitest-environment jsdom
import { api } from "@convex/_generated/api";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUpdateFlashcardProgress } from "./flashcardsApi";
import { useResetQuizAnswers, useUpdateQuizProgress } from "./quizzesApi";
import { useResetWrittenAnswers, useUpdateWrittenQuestionsProgress } from "./writtenQuestionsApi";

const { mockMutate, mockUseMutation } = vi.hoisted(() => {
  const mockMutate = vi.fn().mockResolvedValue(null);
  return { mockMutate, mockUseMutation: vi.fn((_ref: unknown) => mockMutate) };
});

vi.mock("convex/react", () => ({
  useMutation: mockUseMutation,
  useQuery: vi.fn(),
  useAction: vi.fn(),
}));

/** Vitest's `api` mock tags each reference with its path. */
const refName = (ref: unknown) => Object.prototype.toString.call(ref);

const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

beforeEach(() => {
  vi.useFakeTimers();
  mockMutate.mockReset();
  mockMutate.mockResolvedValue(null);
  mockUseMutation.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("practice progress hooks", () => {
  it.each([
    ["flashcards", () => useUpdateFlashcardProgress("item1", 2, 0)],
    ["quizzes", () => useUpdateQuizProgress("item1", 2, 0)],
    ["writtenQuestions", () => useUpdateWrittenQuestionsProgress("item1", 2, 0)],
  ] as const)(
    "saves the last %s position through practice.setLastViewedIndex",
    (itemType, hook) => {
      renderHook(hook);
      advance(500);
      expect(refName(mockUseMutation.mock.calls[0][0])).toBe(
        refName(api.studio.practice.setLastViewedIndex)
      );
      expect(mockMutate).toHaveBeenCalledWith({ itemType, itemId: "item1", index: 2 });
    }
  );

  it("writes nothing when opened at the restored position", () => {
    renderHook(() => useUpdateQuizProgress("item1", 3, 3));
    advance(2000);
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("writes once, 500ms after the position changes", () => {
    const { rerender } = renderHook(({ index }) => useUpdateQuizProgress("item1", index, 3), {
      initialProps: { index: 3 },
    });
    rerender({ index: 4 });
    advance(499);
    expect(mockMutate).not.toHaveBeenCalled();
    advance(1);
    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(mockMutate).toHaveBeenCalledWith({ itemType: "quizzes", itemId: "item1", index: 4 });
    advance(2000);
    expect(mockMutate).toHaveBeenCalledTimes(1);
  });

  it("collapses rapid changes into one write of the last position", () => {
    const { rerender } = renderHook(({ index }) => useUpdateFlashcardProgress("item1", index, 0), {
      initialProps: { index: 0 },
    });
    for (const index of [1, 2, 3]) {
      rerender({ index });
      advance(100);
    }
    advance(500);
    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(mockMutate).toHaveBeenCalledWith({ itemType: "flashcards", itemId: "item1", index: 3 });
  });

  it("does not write again after returning to the position it last wrote", () => {
    const { rerender } = renderHook(
      ({ index }) => useUpdateWrittenQuestionsProgress("item1", index, 0),
      { initialProps: { index: 0 } }
    );
    rerender({ index: 2 });
    advance(500);
    rerender({ index: 2 });
    advance(500);
    expect(mockMutate).toHaveBeenCalledTimes(1);
  });

  it("follows a newer saved position from the server", () => {
    const { rerender } = renderHook(
      ({ index, saved }) => useUpdateQuizProgress("item1", index, saved),
      { initialProps: { index: 0, saved: 0 } }
    );
    // The view restores the server's position once it loads.
    rerender({ index: 5, saved: 5 });
    advance(1000);
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("cancels a pending write on unmount", () => {
    const { rerender, unmount } = renderHook(
      ({ index }) => useUpdateQuizProgress("item1", index, 0),
      { initialProps: { index: 0 } }
    );
    rerender({ index: 1 });
    unmount();
    advance(1000);
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("logs a failed position save instead of leaving the rejection unhandled", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const failure = new Error("offline");
    mockMutate.mockRejectedValueOnce(failure);
    renderHook(() => useUpdateFlashcardProgress("item1", 1, 0));
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(warn).toHaveBeenCalledWith("Failed to save position", failure);
    warn.mockRestore();
  });

  it("quiz Try again resets through practice.resetAnswers", async () => {
    const { result } = renderHook(() => useResetQuizAnswers());
    await result.current("q1");
    expect(refName(mockUseMutation.mock.calls.at(-1)?.[0])).toBe(
      refName(api.studio.practice.resetAnswers)
    );
    expect(mockMutate).toHaveBeenCalledWith({ itemType: "quizzes", itemId: "q1" });
  });

  it("written Try again resets through practice.resetAnswers", async () => {
    const { result } = renderHook(() => useResetWrittenAnswers());
    await result.current("w1");
    expect(refName(mockUseMutation.mock.calls.at(-1)?.[0])).toBe(
      refName(api.studio.practice.resetAnswers)
    );
    expect(mockMutate).toHaveBeenCalledWith({ itemType: "writtenQuestions", itemId: "w1" });
  });
});
