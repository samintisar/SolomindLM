export type StudioExecutionMode = "map_reduce" | "single_pass";

export function decideStudioExecutionMode(input: {
  documentCount: number;
  selectedChunkCount: number;
  estimatedContextTokens: number;
}): StudioExecutionMode {
  if (input.documentCount <= 1 && input.selectedChunkCount <= 8 && input.estimatedContextTokens <= 4000) {
    return "single_pass";
  }
  return "map_reduce";
}
