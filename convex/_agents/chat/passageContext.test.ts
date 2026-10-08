import { describe, expect, it } from "vitest";
import { passageTextForModel } from "./passageContext";
import type { ReferenceChunk } from "./types";

const passage = (content: string, metadata?: ReferenceChunk["metadata"]): ReferenceChunk => ({
  id: "1",
  sourceId: "s",
  sourceTitle: "Paper",
  chunkIndex: 0,
  content,
  metadata,
});

describe("passageTextForModel", () => {
  it("wraps the passage in its neighbours' previews", () => {
    const text = passageTextForModel(
      passage("Thresholds were applied.", {
        previousChunkPreview: "Accelerometers were worn",
        nextChunkPreview: "Minutes per week of MVPA were self-reported",
      })
    );

    expect(text).toBe(
      "...Accelerometers were worn\n\nThresholds were applied.\n\nMinutes per week of MVPA were self-reported..."
    );
  });

  it("strips citation markers from the source text so they cannot be mistaken for ours", () => {
    expect(passageTextForModel(passage("Validated measure [44] of activity [12]."))).toBe(
      "Validated measure  of activity ."
    );
  });

  it("returns the bare passage when there are no previews", () => {
    expect(passageTextForModel(passage("Just this."))).toBe("Just this.");
  });
});
