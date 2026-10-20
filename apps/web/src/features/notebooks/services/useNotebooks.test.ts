// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isVisitedNotebookGone } from "@/shell/notebookHeaderProps";

/**
 * Stands in for Convex: a skipped query reads as loading; a query run while signed out answers as
 * no one, with `[]`, like `notebooks.list` does.
 */
const server = { signedIn: true };
const mockUseQuery = vi.fn((_query: unknown, args: unknown) => {
  if (args === "skip") return undefined;
  return server.signedIn ? [{ id: "n1", title: "Spaced Repetition" }] : [];
});

vi.mock("convex/react", () => ({
  useQuery: mockUseQuery,
  useMutation: vi.fn(),
  usePaginatedQuery: vi.fn(),
}));

const { useNotebooks } = await import("./notebooksApi");

/** The gone check AppShell runs for a notebook that isn't in the list, given `get` returns null. */
function goneFor(signedIn: boolean, notebooks: Array<{ id: string }> | undefined) {
  return isVisitedNotebookGone({
    urlNotebookId: "n1",
    hasShareToken: false,
    signedIn,
    listLoaded: notebooks !== undefined,
    listed: notebooks?.some((nb) => nb.id === "n1") ?? false,
    visited: null,
  });
}

describe("useNotebooks across a sign-in cycle", () => {
  beforeEach(() => {
    server.signedIn = true;
    mockUseQuery.mockClear();
  });

  it("reads as loading while signed out, never as an empty list", () => {
    const { result, rerender } = renderHook(({ signedIn }) => useNotebooks(signedIn), {
      initialProps: { signedIn: true },
    });
    expect(result.current).toEqual([{ id: "n1", title: "Spaced Repetition" }]);
    expect(goneFor(true, result.current)).toBe(false);

    // The token refresh: signed out for a moment.
    server.signedIn = false;
    rerender({ signedIn: false });
    expect(mockUseQuery).toHaveBeenLastCalledWith(expect.anything(), "skip");
    expect(result.current).toBeUndefined();
    expect(goneFor(false, result.current)).toBe(false);

    // Signed back in: the list is queried again, as the user.
    server.signedIn = true;
    rerender({ signedIn: true });
    expect(mockUseQuery).toHaveBeenLastCalledWith(expect.anything(), {});
    expect(goneFor(true, result.current)).toBe(false);
  });
});
