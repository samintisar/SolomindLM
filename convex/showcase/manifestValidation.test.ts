import { describe, expect, test } from "vitest";
import { SHOWCASE_NOTEBOOKS, type ShowcaseNotebook, withPromptText } from "./manifest";
import { validateManifest, validatePromptPacks } from "./manifestValidation";
import { SHOWCASE_PROMPTS } from "./promptPacks";

const valid = (over: Partial<ShowcaseNotebook> = {}): ShowcaseNotebook => ({
  slug: "test-notebook",
  title: "Test Notebook",
  icon: "Book",
  coverColor: "bg-vintage-blue-300",
  sources: [
    {
      kind: "url",
      title: "Supply and demand",
      url: "https://en.wikipedia.org/wiki/Supply_and_demand",
      licence: "CC BY-SA 4.0",
    },
  ],
  studio: [{ kind: "flashcards", cardCount: 35, difficulty: "medium" }],
  ...over,
});

describe("validateManifest", () => {
  test("accepts a valid notebook", () => {
    expect(validateManifest([valid()])).toEqual([]);
  });

  test("rejects duplicate slugs and titles", () => {
    expect(validateManifest([valid(), valid()])).toEqual([
      'notebook "test-notebook": duplicate slug',
      'notebook "test-notebook": duplicate title',
    ]);
  });

  test("rejects counts a user can't pick in the Studio dialogs", () => {
    const errors = validateManifest([
      valid({
        studio: [
          { kind: "flashcards", cardCount: 60, difficulty: "medium" },
          { kind: "quiz", questionCount: 12, difficulty: "easy" },
          { kind: "writtenQuestions", questionCount: 7, difficulty: "easy", questionType: "short" },
        ],
      }),
    ]);
    expect(errors).toEqual([
      'notebook "test-notebook" studio item 0: cardCount must be one of 20, 35, 55',
      'notebook "test-notebook" studio item 1: questionCount must be one of 10, 20, 30',
      'notebook "test-notebook" studio item 2: questionCount must be one of 5, 10, 15',
    ]);
  });

  test("a custom report or spreadsheet needs a prompt", () => {
    const errors = validateManifest([
      valid({
        studio: [
          { kind: "report", reportType: "custom" },
          { kind: "spreadsheet", spreadsheetType: "custom" },
        ],
      }),
    ]);
    expect(errors).toEqual([
      'notebook "test-notebook" studio item 0: a custom report needs a prompt',
      'notebook "test-notebook" studio item 1: a custom spreadsheet needs a prompt',
    ]);
  });

  test("checks the source count, URLs, licences and file names", () => {
    const errors = validateManifest([
      valid({
        sources: [
          { kind: "url", title: "A", url: "http://example.org/a", licence: "CC BY 4.0" },
          { kind: "youtube", title: "B", url: "https://vimeo.com/1", licence: "CC BY 4.0" },
          { kind: "file", fileName: "report.docx", url: "https://example.org/r", licence: "PD" },
          { kind: "text", title: "C", text: "too short", licence: "" },
          { kind: "url", title: "A2", url: "http://example.org/a", licence: "CC BY 4.0" },
          { kind: "url", title: "D", url: "https://example.org/d", licence: "CC BY 4.0" },
          { kind: "url", title: "E", url: "https://example.org/e", licence: "CC BY 4.0" },
          ...Array.from({ length: 9 }, (_, i) => ({
            kind: "url" as const,
            title: `F${i}`,
            url: `https://example.org/f${i}`,
            licence: "CC BY 4.0",
          })),
        ],
      }),
    ]);
    expect(errors).toEqual([
      'notebook "test-notebook": needs 1–15 sources, has 16',
      'notebook "test-notebook" source 0: url must be https',
      'notebook "test-notebook" source 1: not a YouTube URL',
      'notebook "test-notebook" source 2: a file source must be a .pdf',
      'notebook "test-notebook" source 3: text must be 500–20000 characters',
      'notebook "test-notebook" source 3: licence is required',
      'notebook "test-notebook" source 4: url must be https',
      'notebook "test-notebook" source 4: duplicate source',
    ]);
  });

  test("a literature review needs discovered papers; deep research needs sources", () => {
    const errors = validateManifest([
      valid({
        studio: [],
        literatureReview: { question: "Does it work?", researchDatabase: "all" },
      }),
    ]);
    expect(errors).toEqual(['notebook "test-notebook": a literature review needs paperDiscovery']);
  });

  test("pinned DOIs must match the paper count and be distinct", () => {
    const review = (pinnedDois: string[]) =>
      valid({
        sources: [],
        studio: [],
        paperDiscovery: { query: "spacing effect", filters: {}, take: 2, pinnedDois },
        literatureReview: { question: "Does it work?", researchDatabase: "all" },
      });
    expect(validateManifest([review(["10.1/a", "10.1/b"])])).toEqual([]);
    expect(validateManifest([review(["10.1/a", "10.1/A"])])).toEqual([
      'notebook "test-notebook": pinnedDois must be 2 distinct DOIs',
    ]);
    expect(validateManifest([review(["10.1/a"])])).toEqual([
      'notebook "test-notebook": pinnedDois must be 2 distinct DOIs',
    ]);
  });

  test("a prompt key must exist, suit the Studio tool and replace the prompt field", () => {
    const errors = validateManifest([
      valid({
        studio: [
          { kind: "quiz", questionCount: 20, difficulty: "medium", promptKey: "code.quiz" },
          { kind: "report", reportType: "custom", promptKey: "code.cheatsheet" },
          { kind: "flashcards", cardCount: 35, difficulty: "medium", promptKey: "code.quiz" },
          {
            kind: "mindmap",
            prompt: "Map it",
            promptKey: "code.mindmap",
          },
        ],
      }),
    ]);
    expect(errors).toEqual([
      'notebook "test-notebook" studio item 2: promptKey "code.quiz" is a quiz prompt',
      'notebook "test-notebook" studio item 3: set promptKey or prompt, not both',
    ]);
  });

  test("checks the icon and cover colour against the app's pickers", () => {
    expect(validateManifest([valid({ icon: "Rocket", coverColor: "bg-pink-500" })])).toEqual([
      'notebook "test-notebook": unknown icon "Rocket"',
      'notebook "test-notebook": unknown cover colour "bg-pink-500"',
    ]);
  });
});

describe("SHOWCASE_NOTEBOOKS", () => {
  test("is valid", () => {
    expect(validateManifest(SHOWCASE_NOTEBOOKS)).toEqual([]);
  });

  test("covers every Studio type, a literature review and deep research", () => {
    const kinds = new Set(SHOWCASE_NOTEBOOKS.flatMap((n) => n.studio.map((item) => item.kind)));
    expect([...kinds].sort()).toEqual([
      "audio",
      "flashcards",
      "infographic",
      "mindmap",
      "quiz",
      "report",
      "spreadsheet",
      "writtenQuestions",
    ]);
    expect(SHOWCASE_NOTEBOOKS.filter((n) => n.literatureReview)).toHaveLength(1);
    expect(SHOWCASE_NOTEBOOKS.filter((n) => n.deepResearch)).toHaveLength(2);
  });
});

describe("SHOWCASE_PROMPTS", () => {
  test("fit the Prompt Library's limits, with unique titles", () => {
    expect(validatePromptPacks(SHOWCASE_PROMPTS)).toEqual([]);
  });

  test("reports titles, descriptions and texts the Prompt Library would refuse", () => {
    expect(
      validatePromptPacks({
        a: { title: "Same", description: "ok", studioTool: "quiz", text: "Ask things." },
        b: { title: "Same", description: "x".repeat(301), studioTool: "quiz", text: " " },
      })
    ).toEqual([
      'prompt "b": duplicate title',
      'prompt "b": description must be ≤300 characters',
      'prompt "b": text must be 1–2000 characters',
    ]);
  });

  test("every pack prompt is used by a showcase notebook", () => {
    const used = new Set(
      SHOWCASE_NOTEBOOKS.flatMap((n) => n.studio.flatMap((item) => item.promptKey ?? []))
    );
    expect(Object.keys(SHOWCASE_PROMPTS).filter((key) => !used.has(key))).toEqual([]);
  });

  test("withPromptText puts the prompt in the field the Studio job reads", () => {
    expect(
      withPromptText({
        kind: "flashcards",
        cardCount: 35,
        difficulty: "medium",
        promptKey: "code.flashcards",
      })
    ).toMatchObject({ topic: SHOWCASE_PROMPTS["code.flashcards"].text });
    expect(
      withPromptText({
        kind: "audio",
        audioType: "brief",
        length: "short",
        promptKey: "exam.audio",
      })
    ).toMatchObject({
      focus: SHOWCASE_PROMPTS["exam.audio"].text,
    });
    expect(
      withPromptText({ kind: "report", reportType: "custom", promptKey: "papers.digest" })
    ).toMatchObject({
      prompt: SHOWCASE_PROMPTS["papers.digest"].text,
    });
  });
});
