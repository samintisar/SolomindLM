export type RetrieveSpan = {
  startedAt: number | undefined;
  endedAt: number | undefined;
  durationMs: number | undefined;
};

export function createRetrieveClock({ now = Date.now }: { now?: () => number } = {}) {
  let startedAt: number | undefined;
  let endedAt: number | undefined;

  const markStart = () => {
    startedAt ??= now();
  };

  const markEnd = () => {
    endedAt = now();
  };

  const getSpan = (): RetrieveSpan => ({
    startedAt,
    endedAt,
    durationMs: startedAt !== undefined && endedAt !== undefined ? endedAt - startedAt : undefined,
  });

  return {
    markExternalStart: markStart,
    markExternalEnd: markEnd,
    markNotebookStart: markStart,
    markNotebookEnd: markEnd,
    getSpan,
  };
}
