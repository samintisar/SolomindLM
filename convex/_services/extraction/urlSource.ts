import { UserFacingSourceError } from "../../_lib/sourceFailure";

/**
 * Text extraction for `url` sources. Web pages are scraped; links to PDFs are read with OCR,
 * since a scrape of a PDF returns its raw bytes, not its text.
 */

/** arxiv.org abstract and PDF pages, new-style (2310.11511) and old-style (hep-th/9711200) IDs. */
const ARXIV_LINK_REGEX =
  /^https?:\/\/(?:www\.|export\.)?arxiv\.org\/(abs|pdf)\/((?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[a-z]{2})?\/\d{7})(?:v\d+)?(?:\.pdf)?)\/?$/i;

/** Share of U+FFFD (undecodable bytes) above which scraped "text" is really a binary file. */
const BINARY_REPLACEMENT_RATIO = 0.05;

const PDF_UNREADABLE_MESSAGE =
  "We couldn't read the PDF at this link. If it needs a sign-in or blocks downloads, download it and upload the file instead.";
const BINARY_FILE_MESSAGE =
  "This link points to a file, not a web page, and that file type can't be read from a link. Download it and upload the file instead.";

/**
 * The PDF to read for a link: the link itself when it is a PDF (`.pdf` path, arxiv.org/pdf),
 * the paper's PDF for an arXiv abstract page, otherwise undefined.
 */
export function pdfUrlForLink(link: string): string | undefined {
  const arxiv = link.trim().match(ARXIV_LINK_REGEX);
  if (arxiv) {
    return arxiv[1].toLowerCase() === "abs" ? `https://arxiv.org/pdf/${arxiv[2]}` : link.trim();
  }
  try {
    const url = new URL(link.trim());
    if (/^https?:$/.test(url.protocol) && url.pathname.toLowerCase().endsWith(".pdf")) {
      return url.toString();
    }
  } catch {
    // Not a URL; the scraper reports it.
  }
  return undefined;
}

export interface UrlSourceDeps {
  scrape: (url: string) => Promise<{ title: string; content: string }>;
  ocrPdf: (url: string) => Promise<string>;
}

export interface UrlSourceText {
  content: string;
  title?: string;
  method: "pdf_ocr" | "web_scrape";
}

export async function extractUrlSource(link: string, deps: UrlSourceDeps): Promise<UrlSourceText> {
  const pdfUrl = pdfUrlForLink(link);
  if (pdfUrl) {
    return await readPdf(pdfUrl, deps);
  }

  const page = await deps.scrape(link);
  // Links that serve a PDF without a .pdf path (journal "download" links, redirects).
  if (page.content.trimStart().startsWith("%PDF-")) {
    return await readPdf(link, deps);
  }
  if (looksBinary(page.content)) {
    throw new UserFacingSourceError(BINARY_FILE_MESSAGE, `Scraped content of ${link} is binary`);
  }
  return { content: page.content, title: page.title, method: "web_scrape" };
}

async function readPdf(pdfUrl: string, deps: UrlSourceDeps): Promise<UrlSourceText> {
  let content: string;
  try {
    content = await deps.ocrPdf(pdfUrl);
  } catch (error) {
    throw new UserFacingSourceError(
      PDF_UNREADABLE_MESSAGE,
      `PDF OCR failed for ${pdfUrl}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  }
  if (!content.trim()) {
    throw new UserFacingSourceError(
      PDF_UNREADABLE_MESSAGE,
      `PDF OCR returned no text for ${pdfUrl}`
    );
  }
  return { content, title: firstHeading(content), method: "pdf_ocr" };
}

/** The first Markdown heading of OCR output, usually the paper's title. */
function firstHeading(markdown: string): string | undefined {
  return markdown.match(/^#{1,2}\s+(.+?)\s*$/m)?.[1];
}

function looksBinary(text: string): boolean {
  const sample = text.slice(0, 10_000);
  if (!sample) return false;
  const replacements = sample.split("�").length - 1;
  return replacements / sample.length > BINARY_REPLACEMENT_RATIO;
}
