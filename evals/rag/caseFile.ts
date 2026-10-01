/**
 * File-name stem for a fixture id. Use-case pack ids are namespaced
 * ("<pack>/<slug>"), so the id is percent-encoded to keep every per-case file
 * (studio output, exported artifacts, baselines) in one directory. Encoding is
 * reversible, so distinct ids never share a file; plain kebab-case ids pass
 * through unchanged.
 */
export function caseFileStem(caseId: string): string {
  return encodeURIComponent(caseId);
}
