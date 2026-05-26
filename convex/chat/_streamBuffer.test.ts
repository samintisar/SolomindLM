import { describe, it, expect, vi } from "vitest";
import { createChunkBuffer } from "./_streamBuffer";

describe("createChunkBuffer", () => {
  it("buffers tokens and flushes when minChars reached", async () => {
    const writes: string[] = [];
    const writeChunk = vi.fn(async (text: string) => writes.push(text));
    const buffer = createChunkBuffer(writeChunk, {
      flushMs: 1000,
      minChars: 5,
      maxChunkChars: 100,
    });

    await buffer.append("ab");
    expect(writes).toEqual([]);

    await buffer.append("cde");
    expect(writes).toEqual(["abcde"]);
  });

  it("flushes protocol lines immediately without interleaving", async () => {
    const writes: string[] = [];
    const writeChunk = vi.fn(async (text: string) => writes.push(text));
    const buffer = createChunkBuffer(writeChunk, {
      flushMs: 1000,
      minChars: 100,
      maxChunkChars: 1000,
    });

    await buffer.append("some tokens");
    await buffer.append("\n__REFERENCES:[]\n");
    expect(writes).toEqual(["some tokens", "\n__REFERENCES:[]\n"]);
  });

  it("flushes remaining buffer on explicit flush", async () => {
    const writes: string[] = [];
    const writeChunk = vi.fn(async (text: string) => writes.push(text));
    const buffer = createChunkBuffer(writeChunk, {
      flushMs: 1000,
      minChars: 100,
      maxChunkChars: 1000,
    });

    await buffer.append("hello");
    expect(writes).toEqual([]);

    await buffer.flush();
    expect(writes).toEqual(["hello"]);
  });

  it("splits large buffers into maxChunkChars pieces", async () => {
    const writes: string[] = [];
    const writeChunk = vi.fn(async (text: string) => writes.push(text));
    const buffer = createChunkBuffer(writeChunk, {
      flushMs: 1000,
      minChars: 1,
      maxChunkChars: 3,
    });

    await buffer.append("abcdef");
    expect(writes).toEqual(["abc", "def"]);
  });

  it("ignores empty strings", async () => {
    const writeChunk = vi.fn();
    const buffer = createChunkBuffer(writeChunk, {
      flushMs: 1000,
      minChars: 1,
      maxChunkChars: 100,
    });

    await buffer.append("");
    expect(writeChunk).not.toHaveBeenCalled();
  });

  it("flushes by time when minChars is not reached", async () => {
    const writes: string[] = [];
    const writeChunk = vi.fn(async (text: string) => writes.push(text));
    const buffer = createChunkBuffer(writeChunk, {
      flushMs: 0,
      minChars: 100,
      maxChunkChars: 1000,
    });

    await buffer.append("hi");
    expect(writes).toEqual(["hi"]);
  });

  it("behaves as direct pass-through when both thresholds are zero", async () => {
    const writes: string[] = [];
    const writeChunk = vi.fn(async (text: string) => writes.push(text));
    const buffer = createChunkBuffer(writeChunk, {
      flushMs: 0,
      minChars: 0,
      maxChunkChars: 1000,
    });

    await buffer.append("a");
    await buffer.append("b");
    await buffer.append("\n__DONE\n");
    expect(writes).toEqual(["a", "b", "\n__DONE\n"]);
  });
});
