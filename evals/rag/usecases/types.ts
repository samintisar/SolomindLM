/**
 * Use-case eval packs: one folder per advertised use case
 * (see docs/superpowers/specs/2026-09-29-use-case-eval-packs-design.md).
 */
import type { ConcreteRunnerKind, EvalFixture } from "../types";

/** Folder in the eval owner's account that holds every pack notebook. */
export const EVAL_PACK_FOLDER_NAME = "Test";

/**
 * A yes/no quality check a judge answers about one output.
 * Describe what a good output looks like for the audience; never reference
 * specific fixture contents. Rubric text stays in eval code only.
 */
export interface RubricCheck {
  /** kebab-case, unique within the pack */
  id: string;
  /** Yes/no question about the output; "yes" means pass */
  question: string;
  /** Runners this check applies to */
  appliesTo: ConcreteRunnerKind[];
  /** "sources" also gives the judge source excerpts */
  evidence: "output" | "sources";
}

export interface UseCasePack {
  /** e.g. "language-learners"; must match the folder name */
  id: string;
  title: string;
  /** Notebook title inside the eval owner's Test folder */
  notebookTitle: string;
  /** Landing-page claim this pack verifies */
  advertisedClaim: string;
  /** Runners the pack exercises */
  features: ConcreteRunnerKind[];
  /** File names under the pack's sources/ folder */
  sources: string[];
  rubric: RubricCheck[];
}

export interface RegisteredPack {
  pack: UseCasePack;
  fixtures: EvalFixture[];
  /** Absolute path of the pack folder (contains sources/) */
  dir: string;
}

/** Extracted text of one pack source document, used as judge evidence. */
export interface SourceText {
  fileName: string;
  text: string;
}
