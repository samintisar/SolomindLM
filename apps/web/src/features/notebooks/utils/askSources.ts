interface AskSource {
  id: string;
  status?: string;
  selected?: boolean;
}

export type AskSourceChoice =
  | { kind: "override"; documentIds: string[] }
  | { kind: "selection" }
  | { kind: "none" };

/**
 * Which sources a Studio "ask in chat" uses. The map's own sources that still exist and are
 * processed win (sent as an override); otherwise the current selection (no override); otherwise
 * none, and the caller asks the user to select a source.
 */
export function resolveAskSources(
  sources: AskSource[],
  preferredIds: string[] | undefined
): AskSourceChoice {
  const completedIds = new Set(
    sources.filter((source) => source.status === "completed").map((source) => source.id)
  );
  const documentIds = [...new Set(preferredIds ?? [])].filter((id) => completedIds.has(id));
  if (documentIds.length > 0) return { kind: "override", documentIds };

  const hasSelection = sources.some((source) => source.status === "completed" && source.selected);
  return hasSelection ? { kind: "selection" } : { kind: "none" };
}
