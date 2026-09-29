import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { EvalFixture } from "../types";
import { readPackSources } from "./sources";
import type { RegisteredPack, UseCasePack } from "./types";
import { validatePack } from "./validate";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pack-"));
  mkdirSync(join(dir, "sources"));
  writeFileSync(join(dir, "sources", "unit-1.md"), "# Unit 1\nBonjour means hello.");
  writeFileSync(join(dir, "sources", "LICENSES.md"), "- unit-1.md: CC BY 4.0, Example Author");
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

function pack(overrides: Partial<UseCasePack> = {}): UseCasePack {
  return {
    id: "language-learners",
    title: "Language Learners",
    notebookTitle: "Language Learners",
    advertisedClaim: "Create vocabulary lists and grammar exercises from any content.",
    features: ["flashcards", "quiz"],
    sources: ["unit-1.md"],
    rubric: [
      {
        id: "one-item-per-card",
        question: "Does each card test exactly one item?",
        appliesTo: ["flashcards"],
        evidence: "output",
      },
    ],
    ...overrides,
  };
}

function fixture(overrides: Partial<EvalFixture> = {}): EvalFixture {
  return {
    schemaVersion: 1,
    id: "language-learners/flashcards-vocab-01",
    question: "Make flashcards for the vocabulary in unit 1",
    expectedItems: [],
    expectedBehavior: "Cards cover unit 1 vocabulary",
    runner: "flashcards",
    tags: ["use-case"],
    useCase: "language-learners",
    ...overrides,
  };
}

function registered(p: UseCasePack, fixtures: EvalFixture[] = [fixture()]): RegisteredPack {
  return { pack: p, fixtures, dir };
}

describe("validatePack", () => {
  it("accepts a consistent pack", () => {
    expect(validatePack(registered(pack()))).toEqual([]);
  });

  it("flags a missing source file and a source without a licence entry", () => {
    const problems = validatePack(registered(pack({ sources: ["unit-1.md", "unit-2.md"] })));
    expect(problems).toContain('language-learners: source "unit-2.md" not found in sources/');
    expect(problems).toContain('language-learners: source "unit-2.md" has no entry in LICENSES.md');
  });

  it("flags an unsupported source extension", () => {
    writeFileSync(join(dir, "sources", "clip.mp4"), "x");
    writeFileSync(join(dir, "sources", "LICENSES.md"), "- unit-1.md\n- clip.mp4");
    const problems = validatePack(registered(pack({ sources: ["clip.mp4"] })));
    expect(problems).toContain(
      'language-learners: source "clip.mp4" has unsupported extension ".mp4"'
    );
  });

  it("flags fixture id prefix, useCase, pinned notebook and runner problems", () => {
    const problems = validatePack(
      registered(pack(), [
        fixture({ id: "flashcards-vocab-01" }),
        fixture({ id: "language-learners/x", useCase: "medical-students" }),
        fixture({ id: "language-learners/y", notebookId: "nb" }),
        fixture({ id: "language-learners/z", runner: "report" }),
      ])
    );
    expect(problems).toContain('flashcards-vocab-01: id must start with "language-learners/"');
    expect(problems).toContain('language-learners/x: useCase must be "language-learners"');
    expect(problems).toContain(
      "language-learners/y: pack fixtures must not set notebookId or documentIds"
    );
    expect(problems).toContain('language-learners/z: runner "report" is not in pack features');
  });

  it("flags duplicate fixture ids and rubric checks that apply to no feature", () => {
    const problems = validatePack(
      registered(
        pack({
          rubric: [
            { id: "a", question: "?", appliesTo: ["report"], evidence: "output" },
            { id: "a", question: "?", appliesTo: ["quiz"], evidence: "output" },
          ],
        }),
        [fixture(), fixture()]
      )
    );
    expect(problems).toContain("language-learners/flashcards-vocab-01: duplicate fixture id");
    expect(problems).toContain('language-learners: rubric check "a" applies to no listed feature');
    expect(problems).toContain('language-learners: duplicate rubric check "a"');
  });
});

describe("readPackSources", () => {
  it("hashes each listed source and infers its content type", () => {
    const [file] = readPackSources(registered(pack()));
    expect(file.fileName).toBe("unit-1.md");
    expect(file.contentType).toBe("text/markdown");
    expect(file.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(new TextDecoder().decode(file.bytes)).toContain("Bonjour");
  });
});
