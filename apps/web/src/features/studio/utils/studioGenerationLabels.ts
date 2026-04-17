import type { Note, StudioGenerationMetadata } from "@/shared/types/index";

/**
 * Extract persisted studio job progress fields from raw Convex `metadata`.
 */
export function pickStudioGenerationFields(raw: unknown): StudioGenerationMetadata {
  const m = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const mapResults = m.mapResults;
  let completedMapTasks: number | undefined;
  if (typeof m.completedMapTasks === "number") {
    completedMapTasks = m.completedMapTasks;
  } else if (mapResults && typeof mapResults === "object" && !Array.isArray(mapResults)) {
    completedMapTasks = Object.keys(mapResults as object).length;
  }

  const out: StudioGenerationMetadata = {};
  if (typeof m.phase === "string") out.phase = m.phase;
  if (typeof m.progress === "number" && !Number.isNaN(m.progress)) {
    out.progress = m.progress;
  }
  if (typeof m.currentStep === "string") out.currentStep = m.currentStep;
  if (typeof m.totalMapTasks === "number") out.totalMapTasks = m.totalMapTasks;
  if (completedMapTasks !== undefined) out.completedMapTasks = completedMapTasks;
  return out;
}

export interface StudioGeneratingListLines {
  primary: string;
  progressPercent: number | null;
}

/**
 * Copy for the Studio saved-note row while `status === 'generating'`.
 */
export function getStudioGeneratingListLines(note: Note): StudioGeneratingListLines {
  const meta = "metadata" in note ? note.metadata : undefined;
  const gen = pickStudioGenerationFields(meta);
  const primary = gen.currentStep?.trim() || "Starting…";
  const progressPercent =
    typeof gen.progress === "number" && gen.progress >= 0 && gen.progress <= 100
      ? Math.round(gen.progress)
      : null;
  return {
    primary,
    progressPercent,
  };
}
