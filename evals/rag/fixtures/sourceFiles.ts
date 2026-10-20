/**
 * Local copies of fixture notebook sources (`evals/rag/fixtures/sources/`), read as judge evidence
 * for studio artifacts, which carry no retrieved chunks.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { EvalFixture } from "../types";
import type { SourceText } from "../usecases/types";

const SOURCES_DIR = join(import.meta.dirname, "sources");
const cache = new Map<string, string>();

/** The fixture's `sourceFiles` as source texts; undefined when it names none. */
export function loadFixtureSourceTexts(fixture: EvalFixture): SourceText[] | undefined {
  if (!fixture.sourceFiles?.length) return undefined;
  return fixture.sourceFiles.map((fileName) => {
    let text = cache.get(fileName);
    if (text === undefined) {
      const path = join(SOURCES_DIR, fileName);
      if (!existsSync(path)) {
        throw new Error(
          `Fixture ${fixture.id}: source file ${fileName} not found in ${SOURCES_DIR}`
        );
      }
      text = readFileSync(path, "utf-8");
      cache.set(fileName, text);
    }
    return { fileName, text };
  });
}
