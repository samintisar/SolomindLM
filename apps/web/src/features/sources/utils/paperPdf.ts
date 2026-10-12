/** Largest PDF a user can attach to a paper. Mirrors `MAX_PDF_BYTES` in `convex/_services/extraction/openAccess/fetchOaCandidate.ts`. */
export const MAX_PAPER_PDF_BYTES = 50 * 1024 * 1024;

/**
 * Whether a picked file looks like a PDF. `File.type` can be empty or a generic
 * `application/octet-stream` (some Linux desktops and cloud-drive filesystems), so those fall
 * back to a `.pdf` extension.
 */
export function isPdfFile(file: { name: string; type: string }): boolean {
  const type = file.type.split(";")[0].trim().toLowerCase();
  if (type === "application/pdf" || type === "application/x-pdf") return true;
  const unknownType = type === "" || type === "application/octet-stream";
  return unknownType && file.name.toLowerCase().endsWith(".pdf");
}
