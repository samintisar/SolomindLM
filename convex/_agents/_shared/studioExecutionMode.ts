export type StudioExecutionMode = "single_pass" | "map_reduce";

export function decideStudioExecutionMode(input: {
  documentCount: number;
  selectedChunkCount: number;
  estimatedContextTokens: number;
}): StudioExecutionMode {
  if (
    input.documentCount <= 1 &&
    input.selectedChunkCount <= 8 &&
    input.estimatedContextTokens <= 4000
  ) {
    return "single_pass";
  }
  return "map_reduce";
}

export function planStudioJobMapPhase(input: {
  documentCount: number;
  chunks: string[];
  estimateTokens: (text: string) => number;
  pack: (chunks: string[]) => string[];
}): { mode: StudioExecutionMode; mapChunks: string[]; skipMapContent?: string } {
  const { chunks } = input;
  if (chunks.length === 0) {
    return { mode: "map_reduce", mapChunks: [] };
  }

  const estimatedContextTokens = chunks.reduce(
    (sum, chunk) => sum + input.estimateTokens(chunk),
    0
  );
  const mode = decideStudioExecutionMode({
    documentCount: input.documentCount,
    selectedChunkCount: chunks.length,
    estimatedContextTokens,
  });

  if (mode === "single_pass") {
    return {
      mode,
      mapChunks: [],
      skipMapContent: chunks.join("\n\n"),
    };
  }

  return {
    mode,
    mapChunks: input.pack(chunks),
  };
}
