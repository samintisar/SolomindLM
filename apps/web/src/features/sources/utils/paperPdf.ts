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

/**
 * Whether the file's bytes start like a PDF (`%PDF-` within the first 1 KB, as readers allow).
 * The upload is always sent as `application/pdf`, so this is what catches a renamed non-PDF.
 */
export async function hasPdfSignature(file: Blob): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
  return new TextDecoder("latin1").decode(head).includes("%PDF-");
}
