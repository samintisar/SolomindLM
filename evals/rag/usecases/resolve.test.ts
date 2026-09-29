import { describe, expect, it } from "vitest";
import type { EvalFixture } from "../types";
import {
  applyPackResolution,
  formatPlannedJobs,
  PackNotReadyError,
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

  it("throws PackNotReadyError naming the seed command", () => {
    const notReady: PackReadiness = {
      useCase: "medical-students",
      notebookId: null,
      documentIds: [],
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
