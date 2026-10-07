import { api } from "@convex/_generated/api";
import { useMutation } from "convex/react";
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth/useAuth";
import { useToast } from "@/shared/contexts/useToast";
import { parseLimitError, parseServiceError } from "@/shared/utils/errorParser";
import { clearPendingDeck, readPendingDeck } from "../lib/pendingDeck";

const NOTEBOOK_LIMIT_MESSAGE =
  "You've reached your notebook limit. Your flashcards weren't saved — export them from the free tool instead.";
const SAVE_FAILED_MESSAGE =
  "We couldn't save your flashcards. Export them from the free tool instead.";

/** claimDeck is not idempotent: one claim at a time across every mounted claimer. */
let claimInFlight = false;

/**
 * Once signed in, save a deck the visitor made on the free tool and open its notebook.
 * Mounted on the tool page (email/password sign-in) and on /home (OAuth redirects land there).
 * The pending deck is kept after a transient failure (so a later visit retries) and dropped
 * once the server has rejected it for good (plan limit or invalid deck).
 * `onSettled` runs after a claim this hook started succeeds or fails.
 */
export function useClaimPendingDeck(onSettled?: () => void): void {
  const { isAuthenticated } = useAuth();
  const claimDeck = useMutation(api.freeTools.claimDeck.claimDeck);
  const navigate = useNavigate();
  const toast = useToast();
  const started = useRef(false);
  const onSettledRef = useRef(onSettled);
  onSettledRef.current = onSettled;

  useEffect(() => {
    if (!isAuthenticated || started.current || claimInFlight) return;
    const deck = readPendingDeck();
    if (!deck) return;
    started.current = true;
    claimInFlight = true;
    claimDeck({ title: deck.title, sourceText: deck.sourceText, cards: deck.cards })
      .then(({ notebookId }) => {
        clearPendingDeck();
        navigate(`/notebook/${notebookId}`);
      })
      .catch((error: unknown) => {
        const limit = parseLimitError(error);
        const rejected = parseServiceError(error)?.kind === "input_validation";
        if (limit || rejected) clearPendingDeck();
        toast.error(limit?.limitType === "notebook" ? NOTEBOOK_LIMIT_MESSAGE : SAVE_FAILED_MESSAGE);
      })
      .finally(() => {
        claimInFlight = false;
        onSettledRef.current?.();
      });
  }, [isAuthenticated, claimDeck, navigate, toast]);
}
