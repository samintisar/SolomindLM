import { useState, useCallback } from "react";

export function useConversationPinning() {
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem("chat-pinned-ids");
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  const handleTogglePin = useCallback((convId: string) => {
    const id = String(convId);
    setPinnedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem("chat-pinned-ids", JSON.stringify([...next]));
      } catch {
        // localStorage may be unavailable in some environments
      }
      return next;
    });
  }, []);

  const handlePinActiveChat = useCallback(
    (activeConversationId: string | null) => {
      if (!activeConversationId) return;
      handleTogglePin(activeConversationId);
    },
    [handleTogglePin]
  );

  return { pinnedIds, handleTogglePin, handlePinActiveChat };
}
