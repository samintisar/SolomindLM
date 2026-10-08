// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUseQuery = vi.fn();
const mockMutation = vi.fn();

vi.mock("convex/react", () => ({
  useQuery: mockUseQuery,
  // Convex memoizes useMutation's result, so a fixed function stands in for it.
  useMutation: () => mockMutation,
}));

const { useConversationCRUD } = await import("./useConversationCRUD");

describe("useConversationCRUD", () => {
  beforeEach(() => {
    mockUseQuery.mockReset();
  });

  it("returns the same object across rerenders while the conversation list is unchanged", () => {
    mockUseQuery.mockReturnValue([{ _id: "c1" }]);

    const { result, rerender } = renderHook(() => useConversationCRUD("nb-1"));
    const first = result.current;
    rerender();

    expect(result.current).toBe(first);
  });

  it("returns a new object when the conversation list changes", () => {
    mockUseQuery.mockReturnValue([{ _id: "c1" }]);
    const { result, rerender } = renderHook(() => useConversationCRUD("nb-1"));
    const first = result.current;

    mockUseQuery.mockReturnValue([{ _id: "c1" }, { _id: "c2" }]);
    rerender();

    expect(result.current).not.toBe(first);
    expect(result.current.handleRename).toBe(first.handleRename);
  });
});
