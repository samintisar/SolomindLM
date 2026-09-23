/**
 * Module-level store for the most recent backend request id, so a feedback
 * submission can be correlated with server logs. No producers are wired yet;
 * call `setLastRequestId` from error/stream handling in a follow-up.
 */
let lastRequestId: string | undefined;

export function setLastRequestId(id: string | undefined): void {
  lastRequestId = id;
}

export function getLastRequestId(): string | undefined {
  return lastRequestId;
}
