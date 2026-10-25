import { describe, expect, it } from "vitest";
import { attachPassages, isSameCard, passageForCard } from "./sourcePassage";

const CHUNK = [
  "Cells are the basic unit of life.",
  "Mitochondria produce most of the cell's ATP through oxidative phosphorylation.",
  "This process needs oxygen.",
  "Ribosomes assemble proteins from amino acids.",
  "The Golgi apparatus packages proteins for transport.",
].join(" ");

describe("passageForCard", () => {
  it("picks the sentence the card is about, with its neighbours", () => {
    const passage = passageForCard(
      { front: "What do mitochondria produce?", back: "Most of the cell's ATP." },
      CHUNK
    );
    expect(passage).toContain("Mitochondria produce most of the cell's ATP");
    expect(passage).toContain("This process needs oxygen.");
  });

  it("stays within the length cap", () => {
    const passage = passageForCard({ front: "Ribosomes", back: "assemble proteins" }, CHUNK, 60);
    expect(passage.length).toBeLessThanOrEqual(60);
    expect(passage).toContain("Ribosomes");
  });

  it("returns nothing when the card shares no words with the chunk", () => {
    expect(passageForCard({ front: "Capital of France?", back: "Paris" }, CHUNK)).toBe("");
  });
});

describe("attachPassages", () => {
  const pool = [
    { front: "What do mitochondria produce?", back: "ATP", sourcePassage: "passage A" },
    { front: "What do ribosomes assemble?", back: "Proteins", sourcePassage: "passage B" },
  ];

  it("gives a reworded card the passage of the card it matches", () => {
    const [card] = attachPassages([{ front: "Mitochondria produce what?", back: "ATP" }], pool);
    expect(card.sourcePassage).toBe("passage A");
  });

  it("keeps a passage the card already has", () => {
    const [card] = attachPassages(
      [{ front: "What do mitochondria produce?", back: "ATP", sourcePassage: "own" }],
      pool
    );
    expect(card.sourcePassage).toBe("own");
  });

  it("leaves a card that matches nothing without a passage", () => {
    const [card] = attachPassages([{ front: "Capital of France?", back: "Paris" }], pool);
    expect(card.sourcePassage).toBeUndefined();
  });
});

describe("isSameCard", () => {
  it("matches a reworded card and not a different one", () => {
    const card = { front: "What do mitochondria produce?", back: "Most of the cell's ATP" };
    expect(
      isSameCard(card, { front: "Mitochondria produce what?", back: "The cell's ATP, mostly" })
    ).toBe(true);
    expect(isSameCard(card, { front: "What do ribosomes assemble?", back: "Proteins" })).toBe(
      false
    );
  });
});
