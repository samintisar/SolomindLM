"use node";

import { components } from "../../_generated/api";

/** Batched addChunk to stay under Convex mutation write throughput (e.g. 4 MiB/s on S16). */
export const CHAT_STREAM_FLUSH_MS = 85;
export const CHAT_STREAM_FLUSH_MIN_CHARS = 200;
export const CHAT_STREAM_MAX_CHUNK_CHARS = 65536;

export const CHAT_HISTORY_FETCH_LIMIT = 80;

export async function sleepMs(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

export interface ChunkBuffer {
  flushTokenBuffer: () => Promise<void>;
  chunkAppender: (text: string) => Promise<void>;
}

export function createChunkBuffer(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
  streamId: string
): ChunkBuffer {
  const rawAddChunk = async (text: string) => {
    if (!text) return;
    await ctx.runMutation(components.persistentTextStreaming.lib.addChunk, {
      streamId,
      text,
      final: false,
    });
  };

  let tokenBuffer = "";
  let lastFlushAt = Date.now();

  const flushTokenBuffer = async () => {
    if (tokenBuffer.length === 0) return;
    while (tokenBuffer.length > 0) {
      const piece = tokenBuffer.slice(0, CHAT_STREAM_MAX_CHUNK_CHARS);
      tokenBuffer = tokenBuffer.slice(piece.length);
      await rawAddChunk(piece);
    }
    lastFlushAt = Date.now();
  };

  const chunkAppender = async (text: string) => {
    if (!text) return;

    // Protocol lines from streamChatResponse (\n__REFERENCES, \n__ERROR, …): flush tokens first, then one chunk.
    if (text.startsWith("\n__")) {
      await flushTokenBuffer();
      await rawAddChunk(text);
      return;
    }

    tokenBuffer += text;
    const now = Date.now();
    const dueBySize = tokenBuffer.length >= CHAT_STREAM_FLUSH_MIN_CHARS;
    const dueByTime = tokenBuffer.length > 0 && now - lastFlushAt >= CHAT_STREAM_FLUSH_MS;
    if (dueBySize || dueByTime) {
      await flushTokenBuffer();
    }
  };

  return { flushTokenBuffer, chunkAppender };
}
