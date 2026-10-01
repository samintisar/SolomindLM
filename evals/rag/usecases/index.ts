import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { EvalFixture } from "../types";
import { medicalStudentsFixtures } from "./medical-students/fixtures";
import { medicalStudentsPack } from "./medical-students/manifest";
import { professionalsFixtures } from "./professionals/fixtures";
import { professionalsPack } from "./professionals/manifest";
import type { RegisteredPack, UseCasePack } from "./types";

const USECASES_DIR = dirname(fileURLToPath(import.meta.url));

/** Build a registry entry for a pack folder under evals/rag/usecases/<pack.id>/. */
export function registerPack(pack: UseCasePack, fixtures: EvalFixture[]): RegisteredPack {
  return { pack, fixtures, dir: join(USECASES_DIR, pack.id) };
}

/**
 * Pack modules must not import values from `evals/rag/fixtures`: fixtures/index.ts
 * imports this registry at load time, so that would be a circular import (TDZ).
 *
 * Registered use-case packs. Each pack PR adds one entry, e.g.
 *   registerPack(languageLearnersPack, languageLearnersFixtures),
 */
export const USE_CASE_PACKS: RegisteredPack[] = [
  registerPack(medicalStudentsPack, medicalStudentsFixtures),
  registerPack(professionalsPack, professionalsFixtures),
];

export function getPack(id: string): RegisteredPack {
  const found = USE_CASE_PACKS.find((p) => p.pack.id === id);
  if (!found) {
    const known = USE_CASE_PACKS.map((p) => p.pack.id).join(", ") || "(none)";
    throw new Error(`Unknown use-case pack "${id}". Registered: ${known}`);
  }
  return found;
}

export function listPackFixtures(): EvalFixture[] {
  return USE_CASE_PACKS.flatMap((p) => p.fixtures);
}
