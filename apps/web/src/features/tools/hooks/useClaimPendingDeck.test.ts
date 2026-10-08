// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readPendingDeck, savePendingDeck } from "../lib/pendingDeck";
import { useClaimPendingDeck } from "./useClaimPendingDeck";

const claimDeck = vi.fn();
const navigate = vi.fn();
const toastError = vi.fn();

vi.mock("convex/react", () => ({ useMutation: () => claimDeck }));
vi.mock("react-router-dom", () => ({ useNavigate: () => navigate }));
vi.mock("@/features/auth/useAuth", () => ({ useAuth: () => ({ isAuthenticated: true }) }));
vi.mock("@/shared/contexts/useToast", () => ({ useToast: () => ({ error: toastError }) }));

const deck = {
  title: "Cells",
  sourceText: "some source text",
  cards: [{ type: "definition" as const, front: "Define: cell", back: "Unit of life" }],
};

describe("useClaimPendingDeck", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    savePendingDeck(deck);
  });

  it("claims the deck, clears it and opens the notebook", async () => {
    claimDeck.mockResolvedValue({ notebookId: "nb1", flashcardId: "fc1" });
    renderHook(() => useClaimPendingDeck());
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/notebook/nb1"));
    expect(claimDeck).toHaveBeenCalledWith(deck);
    expect(readPendingDeck()).toBeNull();
  });

  it("claims once when two claimers run at the same time", async () => {
    let resolveClaim: (value: { notebookId: string; flashcardId: string }) => void = () => {};
    claimDeck.mockReturnValue(
      new Promise((resolve) => {
        resolveClaim = resolve;
      })
    );
    const firstSettled = vi.fn();
    const secondSettled = vi.fn();
    renderHook(() => useClaimPendingDeck(firstSettled));
    renderHook(() => useClaimPendingDeck(secondSettled));
    expect(claimDeck).toHaveBeenCalledOnce();
    // The claimer that found the deck taken settles at once, so its caller isn't left waiting.
    expect(secondSettled).toHaveBeenCalledOnce();
    expect(firstSettled).not.toHaveBeenCalled();
    resolveClaim({ notebookId: "nb1", flashcardId: "fc1" });
    await waitFor(() => expect(firstSettled).toHaveBeenCalledOnce());
    expect(navigate).toHaveBeenCalledOnce();
  });

  it("reports when a failed claim settles", async () => {
    claimDeck.mockRejectedValue(new Error("Network error"));
    const onSettled = vi.fn();
    renderHook(() => useClaimPendingDeck(onSettled));
    await waitFor(() => expect(onSettled).toHaveBeenCalledOnce());
  });

  it("does nothing without a pending deck, and settles", () => {
    localStorage.clear();
    const onSettled = vi.fn();
    renderHook(() => useClaimPendingDeck(onSettled));
    expect(claimDeck).not.toHaveBeenCalled();
    expect(onSettled).toHaveBeenCalledOnce();
  });

  it("explains the notebook limit and drops the deck", async () => {
    claimDeck.mockRejectedValue(
      new ConvexError({
        code: "NOTEBOOK_LIMIT_REACHED",
        limit: 5,
        current: 5,
        limitType: "notebook",
        isPro: false,
      })
    );
    renderHook(() => useClaimPendingDeck());
    await waitFor(() => expect(toastError).toHaveBeenCalledOnce());
    expect(toastError.mock.calls[0][0]).toContain("notebook limit");
    expect(readPendingDeck()).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("drops a deck the server rejected as invalid", async () => {
    claimDeck.mockRejectedValue(
      new ConvexError({
        type: "INPUT_VALIDATION_ERROR",
        field: "cards",
        detail: "A card is too long",
      })
    );
    renderHook(() => useClaimPendingDeck());
    await waitFor(() => expect(toastError).toHaveBeenCalledOnce());
    expect(toastError.mock.calls[0][0]).toContain("couldn't save");
    expect(readPendingDeck()).toBeNull();
  });

  it("keeps the deck after a network error so a later visit retries", async () => {
    claimDeck.mockRejectedValue(new Error("Network error"));
    renderHook(() => useClaimPendingDeck());
    await waitFor(() => expect(toastError).toHaveBeenCalledOnce());
    expect(toastError.mock.calls[0][0]).toContain("couldn't save");
    expect(readPendingDeck()).not.toBeNull();
  });
});
