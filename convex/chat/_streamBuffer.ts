"use node";

export interface ChunkBufferConfig {
  /** Max time (ms) to hold tokens before flushing. */
  flushMs: number;
  /** Min buffered chars to trigger a flush. */
  minChars: number;
  /** Max chars per individual chunk write. */
  maxChunkChars: number;
}

export interface ChunkBuffer {
  append(text: string): Promise<void>;
  flush(): Promise<void>;
}

/**
 * Creates a buffered chunk writer for persistent text streaming.
 *
 * Protocol lines (starting with `\n__`) are always flushed immediately
 * so that markers like `__REFERENCES` or `__ERROR` never get interleaved
 * with buffered tokens.
 */
export function createChunkBuffer(
  writeChunk: (text: string) => Promise<void>,
  config: ChunkBufferConfig
): ChunkBuffer {
  let tokenBuffer = "";
  let lastFlushAt = Date.now();

  const flushBuffer = async () => {
    if (tokenBuffer.length === 0) return;
    while (tokenBuffer.length > 0) {
      const piece = tokenBuffer.slice(0, config.maxChunkChars);
      tokenBuffer = tokenBuffer.slice(piece.length);
      await writeChunk(piece);
    }
    lastFlushAt = Date.now();
  };

  return {
    async append(text: string) {
      if (!text) return;

      if (text.startsWith("\n__")) {
        await flushBuffer();
        await writeChunk(text);
        return;
      }

      tokenBuffer += text;
      const now = Date.now();
      const dueBySize = tokenBuffer.length >= config.minChars;
      const dueByTime = tokenBuffer.length > 0 && now - lastFlushAt >= config.flushMs;
      if (dueBySize || dueByTime) {
        await flushBuffer();
      }
    },

    async flush() {
      await flushBuffer();
    },
  };
}
