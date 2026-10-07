import { describe, expect, it } from "vitest";
import { STREAM_TOKEN_SLICE_CHARS } from "./chatConfig.js";
import { sliceParagraphForStream } from "./streamSlice";

async function slices(para: string): Promise<string[]> {
  const out: string[] = [];
  for await (const piece of sliceParagraphForStream(para)) out.push(piece);
  return out;
}

describe("sliceParagraphForStream", () => {
  it("streams a short paragraph in one piece", async () => {
    expect(await slices("  Self-RAG retrieves on demand.  ")).toEqual([
      "Self-RAG retrieves on demand.\n\n",
    ]);
  });

  // Each slice boundary used to drop its space, joining words in the stored answer (#353).
  it("keeps the space at every slice boundary of a long paragraph", async () => {
    const para = Array.from({ length: 120 }, (_, i) => `word${i} factuality through`).join(" ");
    expect(para.length).toBeGreaterThan(STREAM_TOKEN_SLICE_CHARS * 2);

    const pieces = await slices(para);

    expect(pieces.length).toBeGreaterThan(2);
    expect(pieces.join("")).toBe(`${para}\n\n`);
  });

  it("splits a paragraph without spaces at the size limit and loses nothing", async () => {
    const para = "x".repeat(STREAM_TOKEN_SLICE_CHARS * 2 + 7);
    expect((await slices(para)).join("")).toBe(`${para}\n\n`);
  });

  it("streams nothing for a blank paragraph", async () => {
    expect(await slices(" \n ")).toEqual([]);
  });
});
