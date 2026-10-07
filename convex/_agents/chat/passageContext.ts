import type { ReferenceChunk } from "./types";

/**
 * A passage's text exactly as chat's grounding prompt shows it: the source's own citation
 * markers stripped, wrapped in the ~100-character previews of its neighbouring passages.
 * Eval judges score against this too, so they see what the model saw.
 */
export function passageTextForModel(chunk: ReferenceChunk): string {
  const meta = chunk.metadata;
  let text = chunk.content.replace(/\[\d+\]/g, "");
  if (meta?.previousChunkPreview) {
    text = `...${meta.previousChunkPreview}\n\n${text}`;
  }
  if (meta?.nextChunkPreview) {
    text = `${text}\n\n${meta.nextChunkPreview}...`;
  }
  return text;
}
