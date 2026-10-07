import { describe, expect, it } from "vitest";
import { exportFileName, toAnkiText, toCsv, toQuizletText } from "./flashcardExport";

const cards = [
  { front: "What makes ATP?", back: "Mitochondria" },
  { front: 'Define "osmosis"\n(short)', back: "Water moves\tacross a membrane" },
];

describe("toAnkiText", () => {
  it("writes Anki's file headers and one tab-separated card per line", () => {
    expect(toAnkiText(cards)).toBe(
      [
        "#separator:tab",
        "#html:false",
        "#columns:Front\tBack",
        "What makes ATP?\tMitochondria",
        'Define "osmosis" (short)\tWater moves across a membrane',
        "",
      ].join("\n")
    );
  });
});

describe("toQuizletText", () => {
  it("writes term TAB definition, one card per line, no headers", () => {
    expect(toQuizletText(cards)).toBe(
      'What makes ATP?\tMitochondria\nDefine "osmosis" (short)\tWater moves across a membrane'
    );
  });
});

describe("toCsv", () => {
  it("starts with a BOM and quotes every cell", () => {
    const csv = toCsv(cards);
    expect(csv.startsWith("﻿Front,Back\r\n")).toBe(true);
    expect(csv).toContain('"Define ""osmosis""\n(short)","Water moves\tacross a membrane"');
  });
});

describe("exportFileName", () => {
  it("slugs the title", () => {
    expect(exportFileName("Cell Biology: Mitochondria!", "txt")).toBe(
      "cell-biology-mitochondria-flashcards.txt"
    );
  });
  it("falls back when the title has no letters", () => {
    expect(exportFileName("!!!", "csv")).toBe("flashcards.csv");
  });
});
