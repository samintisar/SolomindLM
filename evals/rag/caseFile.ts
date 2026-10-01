/**
 * File-name stem for a fixture id. Use-case pack ids are namespaced
 * ("<pack>/<slug>"), so path separators are flattened to keep every
 * per-case file (studio output, exported artifacts, baselines) in one directory.
 */
export function caseFileStem(caseId: string): string {
  return caseId.replace(/[/\\]/g, "__");
}
