import type { FinalMindMap } from "./state";

const TITLE_SOURCE_LIMIT = 2000;

/**
 * Text the mind map title is written from: the finished map's root and main branches, so the
 * title matches the map. Falls back to the source extractions when the map has no root topic.
 * (The extractions alone start with whichever source comes first, which titled multi-source maps
 * after that one source.)
 */
export function mindMapTitleSource(map: FinalMindMap, extractions: string[]): string {
  const root = map.nodeData.topic?.trim();
  if (root) {
    const branches = (map.nodeData.children ?? [])
      .map((c) => c.topic?.trim())
      .filter(Boolean)
      .join("; ");
    return (branches ? `${root}: ${branches}` : root).slice(0, TITLE_SOURCE_LIMIT);
  }
  return extractions.join(" ").slice(0, TITLE_SOURCE_LIMIT);
}
