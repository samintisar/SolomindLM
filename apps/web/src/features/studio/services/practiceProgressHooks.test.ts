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

beforeEach(() => {
  vi.useFakeTimers();
  mockMutate.mockClear();
  mockUseMutation.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("practice progress hooks", () => {
  it.each([
    ["flashcards", () => useUpdateFlashcardProgress("item1", 2)],
    ["quizzes", () => useUpdateQuizProgress("item1", 2)],
    ["writtenQuestions", () => useUpdateWrittenQuestionsProgress("item1", 2)],
  ] as const)(
    "saves the last %s position through practice.setLastViewedIndex",
    (itemType, hook) => {
      renderHook(hook);
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(refName(mockUseMutation.mock.calls[0][0])).toBe(
        refName(api.studio.practice.setLastViewedIndex)
      );
      expect(mockMutate).toHaveBeenCalledWith({ itemType, itemId: "item1", index: 2 });
    }
  );

  it("Try again resets through practice.resetAnswers", async () => {
    const { result: quiz } = renderHook(() => useResetQuizAnswers());
    await quiz.current("q1");
    expect(mockMutate).toHaveBeenLastCalledWith({ itemType: "quizzes", itemId: "q1" });

    const { result: written } = renderHook(() => useResetWrittenAnswers());
    await written.current("w1");
    expect(mockMutate).toHaveBeenLastCalledWith({ itemType: "writtenQuestions", itemId: "w1" });
    expect(refName(mockUseMutation.mock.calls.at(-1)?.[0])).toBe(
      refName(api.studio.practice.resetAnswers)
    );
  });
});
