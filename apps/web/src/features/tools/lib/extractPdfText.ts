import { FREE_FLASHCARD_MAX_PDF_PAGES } from "@convex/_lib/freeToolBounds";

type TextItemLike = { str?: string; hasEOL?: boolean };

export function pageItemsToText(items: TextItemLike[]): string {
  let out = "";
  for (const item of items) {
    if (typeof item.str !== "string") continue;
    out += item.str;
    if (item.hasEOL) out += "\n";
    else if (item.str && !item.str.endsWith(" ")) out += " ";
  }
  return out
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type PdfTextResult = { text: string; pagesRead: number; totalPages: number };

/** Text layer of the first pages, in the browser. Empty text means a scanned (image-only) PDF. */
export async function extractPdfText(file: File): Promise<PdfTextResult> {
  const pdfjs = await import("pdfjs-dist");
  // Same worker file PdfViewer uses (copied to /public by the pdfjsWorker Vite plugin).
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  try {
    const totalPages = doc.numPages;
    const pagesRead = Math.min(totalPages, FREE_FLASHCARD_MAX_PDF_PAGES);
    const pages: string[] = [];
    for (let i = 1; i <= pagesRead; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      pages.push(pageItemsToText(content.items as TextItemLike[]));
    }
    return { text: pages.join("\n\n").trim(), pagesRead, totalPages };
  } finally {
    await doc.destroy();
  }
}
