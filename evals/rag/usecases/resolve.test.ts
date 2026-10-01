import { describe, expect, it } from "vitest";
import { runEval } from "../runners";
import type { EvalFixture } from "../types";
import {
  applyPackResolution,
  excludeUnselectedPackFixtures,
  formatPlannedJobs,
  PackNotReadyError,
  packSourceTextsFor,
  pinForDryRun,
  prepareUseCaseRun,
  resolvePackReadiness,
} from "./resolve";
import type { PackReadiness } from "./sync";
import type { UseCasePack } from "./types";

function fixture(
  id: string,
  useCase: string | undefined,
  runner: EvalFixture["runner"]
): EvalFixture {
  return {
    schemaVersion: 1,
    id,
    question: "q",
    expectedItems: [],
    expectedBehavior: "b",
    runner,
    tags: [],
    useCase,
    notebookId: useCase ? undefined : "legacy-nb",
  };
}

const ready: PackReadiness = {
  useCase: "language-learners",
  notebookId: "nb-lang",
  documentIds: ["d1", "d2"],
  documentFileNames: { d1: "unit-1.md", d2: "Unit-2-Verbs.md" },
  problems: [],
};

describe("applyPackResolution", () => {
  it("pins pack fixtures to the pack notebook and documents; leaves others alone", () => {
    const [pack, legacy] = applyPackResolution(
      [
        fixture("language-learners/a", "language-learners", "flashcards"),
        fixture("ml-x", undefined, "chat"),
      ],
      new Map([["language-learners", ready]])
    );
    expect(pack.notebookId).toBe("nb-lang");
    expect(pack.documentIds).toEqual(["d1", "d2"]);
    expect(legacy.notebookId).toBe("legacy-nb");
  });

  it("narrows a fixture to the pack sources its documentTitleHint matches (case-insensitive)", () => {
    const scoped = {
      ...fixture("language-learners/b", "language-learners", "flashcards"),
      studioParams: { documentTitleHint: "unit-2" },
    };
    const [pinned] = applyPackResolution([scoped], new Map([["language-learners", ready]]));
    expect(pinned.documentIds).toEqual(["d2"]);
  });

  it("throws when a documentTitleHint matches no pack source", () => {
    const scoped = {
      ...fixture("language-learners/b", "language-learners", "flashcards"),
      studioParams: { documentTitleHint: "unit-9" },
    };
    expect(() => applyPackResolution([scoped], new Map([["language-learners", ready]]))).toThrow(
      'language-learners/b: documentTitleHint "unit-9" matches no pack source'
    );
  });

  it("throws PackNotReadyError naming the seed command", () => {
    const notReady: PackReadiness = {
      useCase: "medical-students",
      notebookId: null,
      documentIds: [],
      documentFileNames: {},
      problems: ['notebook "Medical Students" not found in the Test folder'],
    };
    const run = () =>
      applyPackResolution(
        [fixture("medical-students/a", "medical-students", "quiz")],
        new Map([["medical-students", notReady]])
      );
    expect(run).toThrow(PackNotReadyError);
    expect(run).toThrow(/bun run eval:seed --use-case medical-students/);
  });
});

describe("resolvePackReadiness", () => {
  it("resolves each pack once through the API", async () => {
    const titles: string[] = [];
    const pack = { id: "language-learners", notebookTitle: "Language Learners" } as UseCasePack;
    const result = await resolvePackReadiness(
      [{ pack, local: [{ fileName: "a.md", sha256: "1" }] }],
      {
        resolve: async (title) => {
          titles.push(title);
          return {
            notebookId: "nb",
            docs: [{ documentId: "d1", fileName: "a.md", status: "completed", sha256: "1" }],
          };
        },
      }
    );
    expect(titles).toEqual(["Language Learners"]);
    expect(result.get("language-learners")).toEqual({
      useCase: "language-learners",
      notebookId: "nb",
      documentIds: ["d1"],
      documentFileNames: { d1: "a.md" },
      problems: [],
    });
  });
});

describe("formatPlannedJobs", () => {
  it("counts jobs per pack and runner", () => {
    expect(
      formatPlannedJobs([
        fixture("language-learners/a", "language-learners", "flashcards"),
        fixture("language-learners/b", "language-learners", "flashcards"),
        fixture("language-learners/c", "language-learners", "quiz"),
        fixture("ml-x", undefined, "chat"),
      ])
    ).toBe("  language-learners: flashcards×2 quiz×1");
  });
});

describe("prepareUseCaseRun", () => {
  const pack = { id: "language-learners", notebookTitle: "Language Learners" } as UseCasePack;
  const loadPack = () => ({ pack, local: [{ fileName: "a.md", sha256: "1" }] });
  const readyNotebook = {
    notebookId: "nb",
    docs: [{ documentId: "d1", fileName: "a.md", status: "completed", sha256: "1" }],
  };

  it("pins pack fixtures and loads source text for ready packs", async () => {
    const asked: string[][] = [];
    const result = await prepareUseCaseRun(
      [
        fixture("language-learners/a", "language-learners", "flashcards"),
        fixture("language-learners/b", "language-learners", "quiz"),
        fixture("ml-x", undefined, "chat"),
      ],
      {
        resolve: async () => readyNotebook,
        sourceText: async (ids) => {
          asked.push(ids);
          return [{ fileName: "a.md", text: "hello" }];
        },
      },
      loadPack
    );
    expect(result.fixtures.map((f) => f.notebookId)).toEqual(["nb", "nb", "legacy-nb"]);
    expect(result.sourceTexts.get("language-learners")).toEqual([
      { fileName: "a.md", text: "hello" },
    ]);
    expect(asked).toEqual([["d1"]]);
  });

  it("throws PackNotReadyError before fetching any source text", async () => {
    let fetched = false;
    await expect(
      prepareUseCaseRun(
        [fixture("language-learners/a", "language-learners", "flashcards")],
        {
          resolve: async () => null,
          sourceText: async () => {
            fetched = true;
            return [];
          },
        },
        loadPack
      )
    ).rejects.toThrow(PackNotReadyError);
    expect(fetched).toBe(false);
  });

  it("does nothing when no fixture belongs to a pack", async () => {
    const fixtures = [fixture("ml-x", undefined, "chat")];
    const api = {
      resolve: async () => {
        throw new Error("should not resolve");
      },
      sourceText: async () => [],
    };
    const result = await prepareUseCaseRun(fixtures, api, loadPack);
    expect(result.fixtures).toBe(fixtures);
    expect(result.sourceTexts.size).toBe(0);
  });
});

describe("pinForDryRun", () => {
  it("gives pack fixtures a placeholder notebook and leaves legacy fixtures alone", () => {
    const [pack, legacy] = pinForDryRun([
      fixture("language-learners/a", "language-learners", "flashcards"),
      fixture("ml-x", undefined, "chat"),
    ]);
    expect(pack.notebookId).toBe("dry-run:language-learners");
    expect(legacy.notebookId).toBe("legacy-nb");
  });

  it("lets studio, literature review and chat pack fixtures pass runEval in dry-run mode", async () => {
    const fixtures = pinForDryRun(
      (["flashcards", "quiz", "literatureReview", "chat"] as const).map((runner) => ({
        ...fixture(`language-learners/${runner}`, "language-learners", runner),
        expectedItems: ["item"],
      }))
    );
    for (const f of fixtures) {
      const results = await runEval(f, { dryRun: true });
      expect(results.flatMap((r) => r.errors)).toEqual([]);
    }
  });

  it("would fail validation without the pin", async () => {
    const unpinned = {
      ...fixture("language-learners/a", "language-learners", "flashcards"),
      expectedItems: ["item"],
    };
    const [{ errors }] = await runEval(unpinned, { dryRun: true });
    expect(errors).toContain("Studio fixture must specify a notebookId");
  });
});

describe("excludeUnselectedPackFixtures", () => {
  const all = [
    fixture("ml-x", undefined, "chat"),
    fixture("agentic-patterns-20", undefined, "chat"),
    fixture("language-learners/a", "language-learners", "flashcards"),
    fixture("medical-students/a", "medical-students", "quiz"),
  ];
  const byId = new Map(all.map((f) => [f.id, f]));
  const get = (id: string) => byId.get(id) as EvalFixture;
  const ids = all.map((f) => f.id);
  const known = ["language-learners", "medical-students"];

  it("keeps only legacy fixtures by default", () => {
    expect(excludeUnselectedPackFixtures(ids, get, {}, known)).toEqual([
      "ml-x",
      "agentic-patterns-20",
    ]);
  });

  it("keeps pack fixtures when --use-case is set", () => {
    expect(
      excludeUnselectedPackFixtures(ids, get, { useCases: ["language-learners"] }, known)
    ).toEqual(ids);
  });

  it("keeps pack fixtures when the prefix selects a registered pack", () => {
    expect(
      excludeUnselectedPackFixtures(ids, get, { idPrefix: "language-learners/" }, known)
    ).toEqual(ids);
  });

  it("still drops pack fixtures for a non-pack prefix", () => {
    expect(excludeUnselectedPackFixtures(ids, get, { idPrefix: "ml-" }, known)).toEqual([
      "ml-x",
      "agentic-patterns-20",
    ]);
    // A prefix that merely starts like a pack id (no slash) is not an explicit selection.
    expect(
      excludeUnselectedPackFixtures(ids, get, { idPrefix: "language-learners" }, known)
    ).toEqual(["ml-x", "agentic-patterns-20"]);
  });
});

describe("packSourceTextsFor", () => {
  const texts = [
    { fileName: "unit-1.md", text: "one" },
    { fileName: "Unit-2-Verbs.md", text: "two" },
  ];

  it("returns every pack source when the fixture has no documentTitleHint", () => {
    const f = fixture("language-learners/a", "language-learners", "flashcards");
    expect(packSourceTextsFor(f, texts)).toEqual(texts);
  });

  it("returns only the sources the documentTitleHint matches", () => {
    const f = {
      ...fixture("language-learners/a", "language-learners", "flashcards"),
      studioParams: { documentTitleHint: "UNIT-2" },
    };
    expect(packSourceTextsFor(f, texts)).toEqual([texts[1]]);
  });

  it("passes undefined through", () => {
    const f = fixture("language-learners/a", "language-learners", "flashcards");
    expect(packSourceTextsFor(f, undefined)).toBeUndefined();
  });
});
