import type { ReferenceChunk } from "./types";

/** A bracketed list of reference numbers: `[6]`, `[6-8]`, `[2,3]`, `[4, 5–7]`. */
const SOURCE_REFERENCE_MARKER = /\[(\d+(?:\s*[-–]\s*\d+)?(?:\s*,\s*\d+(?:\s*[-–]\s*\d+)?)*)\]/g;

/**
 * Rewrites a source's own numbered references as `(ref. 6)` / `(refs. 6-8)`. Left as `[6]` they
 * read like the passage numbers the answer cites by; stripped, a sentence reporting a cited
 * study's result reads like the source's own finding (#477). A list holding a 0 is left alone,
 * since it is more likely an interval than a reference. Code (fenced blocks and inline code) is
 * left alone: `layers[2]` is an index, not a reference.
 */
export function markSourceReferences(text: string): string {
  return text
    .split(CODE_SEGMENT)
    .map((segment) =>
      segment.startsWith("`")
        ? segment
        : segment.replace(SOURCE_REFERENCE_MARKER, (marker, refs: string) => {
            const numbers = refs.match(/\d+/g) ?? [];
            if (numbers.some((n) => Number(n) === 0)) return marker;
            return numbers.length === 1 ? `(ref. ${refs})` : `(refs. ${refs})`;
          })
    )
    .join("");
}

/** Fenced code blocks and inline code. */
const CODE_SEGMENT = /(```[\s\S]*?```|`[^`\n]*`)/;

/**
 * A passage's text exactly as chat's grounding prompt shows it: the source's own reference
 * markers rewritten (see markSourceReferences), wrapped in the ~100-character previews of its
 * neighbouring passages. Eval judges score against this too, so they see what the model saw.
 */
export function passageTextForModel(chunk: ReferenceChunk): string {
  const meta = chunk.metadata;
  let text = markSourceReferences(chunk.content);
  if (meta?.previousChunkPreview) {
    text = `...${markSourceReferences(meta.previousChunkPreview)}\n\n${text}`;
  }
  if (meta?.nextChunkPreview) {
    text = `${text}\n\n${markSourceReferences(meta.nextChunkPreview)}...`;
  }
  return text;
}
