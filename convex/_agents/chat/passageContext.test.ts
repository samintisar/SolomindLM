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

  it("rewrites the source's own reference markers so they cannot be mistaken for ours", () => {
    expect(passageTextForModel(passage("Validated measure [44] of activity [12]."))).toBe(
      "Validated measure (ref. 44) of activity (ref. 12)."
    );
  });

  it("keeps ranges and lists of references, which mark a claim as another study's (#477)", () => {
    expect(
      passageTextForModel(
        passage(
          "Effective in treating [6-8] and preventing [9] depression [2,3] and anxiety [4, 5–7]."
        )
      )
    ).toBe(
      "Effective in treating (refs. 6-8) and preventing (ref. 9) depression (refs. 2,3) and anxiety (refs. 4, 5–7)."
    );
  });

  it("leaves bracketed numbers that are not references alone", () => {
    expect(passageTextForModel(passage("Scores in [0, 1] and [0.5] and [2024a] stay."))).toBe(
      "Scores in [0, 1] and [0.5] and [2024a] stay."
    );
  });

  it("rewrites reference markers in the neighbours' previews too", () => {
    expect(
      passageTextForModel(
        passage("Middle.", {
          previousChunkPreview: "Earlier work [3]",
          nextChunkPreview: "Later [4-5]",
        })
      )
    ).toBe("...Earlier work (ref. 3)\n\nMiddle.\n\nLater (refs. 4-5)...");
  });

  it("returns the bare passage when there are no previews", () => {
    expect(passageTextForModel(passage("Just this."))).toBe("Just this.");
  });
});
