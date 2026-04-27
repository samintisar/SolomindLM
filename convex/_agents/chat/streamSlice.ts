"use node";

import { STREAM_TOKEN_SLICE_CHARS } from "./chatConfig.js";

export async function* sliceParagraphForStream(para: string): AsyncGenerator<string> {
  const trimmed = para.trim();
  if (!trimmed) return;
  const max = Math.max(120, STREAM_TOKEN_SLICE_CHARS);
  if (trimmed.length <= max) {
    yield trimmed + "\n\n";
    return;
  }
  let i = 0;
  while (i < trimmed.length) {
    let end = Math.min(i + max, trimmed.length);
    if (end < trimmed.length) {
      const sp = trimmed.lastIndexOf(" ", end);
      if (sp > i + 48) end = sp + 1;
    }
    const part = trimmed.slice(i, end).trimEnd();
    if (part) {
      yield part + (end >= trimmed.length ? "\n\n" : "");
    }
    i = end;
  }
}
