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
        '"What makes ATP?"\t"Mitochondria"',
        '"Define ""osmosis"" (short)"\t"Water moves across a membrane"',
        "",
      ].join("\n")
    );
  });

  it("quotes fields so fronts starting with # or a quote survive the importer", () => {
    expect(toAnkiText([{ front: "#hashtag is a label", back: '"Quoted" answer' }])).toContain(
      '\n"#hashtag is a label"\t"""Quoted"" answer"\n'
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

  it("opens formula-like cells as text and keeps signed numbers", () => {
    const csv = toCsv([
      { front: '=HYPERLINK("http://x","y")', back: "+ve charge" },
      { front: "Absolute zero in °C?", back: "-273.15" },
    ]);
    expect(csv).toContain(`"'=HYPERLINK(""http://x"",""y"")","'+ve charge"`);
    expect(csv).toContain('"Absolute zero in °C?","-273.15"');
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
