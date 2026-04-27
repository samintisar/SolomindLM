import { v } from "convex/values";

/** Bibliographic + OA resolver fields for discovery-added papers (OpenAlex-first). */
export const paperRecordValidator = v.object({
  abstract: v.string(),
  authors: v.array(v.string()),
  doi: v.optional(v.string()),
  venue: v.optional(v.string()),
  publicationYear: v.optional(v.number()),
  openAlexId: v.optional(v.string()),
  semanticScholarId: v.optional(v.string()),
  isOa: v.boolean(),
  pdfUrl: v.optional(v.string()),
  landingPageUrl: v.optional(v.string()),
  license: v.optional(v.string()),
});

export const fulltextStatusValidator = v.union(
  v.literal("available"),
  v.literal("unavailable"),
  v.literal("external_only")
);

export const ingestionStatusValidator = v.union(
  v.literal("pending"),
  v.literal("ingested"),
  v.literal("metadata_only"),
  v.literal("failed")
);

export type PaperRecord = {
  abstract: string;
  authors: string[];
  doi?: string;
  venue?: string;
  publicationYear?: number;
  openAlexId?: string;
  semanticScholarId?: string;
  isOa: boolean;
  pdfUrl?: string;
  landingPageUrl?: string;
  license?: string;
};

export function normalizeDoi(doi: string | undefined): string | undefined {
  if (!doi) return undefined;
  let d = doi.trim();
  if (!d) return undefined;
  d = d.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "");
  return d || undefined;
}

export function deriveFulltextStatus(pr: {
  pdfUrl?: string;
  landingPageUrl?: string;
  doi?: string;
}): "available" | "unavailable" | "external_only" {
  const pdf = pr.pdfUrl?.trim() ?? "";
  if (pdf && /^https?:\/\//i.test(pdf)) return "available";
  const landing = pr.landingPageUrl?.trim() ?? "";
  if (landing && /^https?:\/\//i.test(landing)) return "external_only";
  const doi = normalizeDoi(pr.doi);
  if (doi) return "external_only";
  return "unavailable";
}

export function primaryLinkUrlForPaper(pr: PaperRecord): string {
  const landing = pr.landingPageUrl?.trim();
  if (landing) return landing;
  const doi = normalizeDoi(pr.doi);
  if (doi) return `https://doi.org/${doi}`;
  const pdf = pr.pdfUrl?.trim();
  if (pdf) return pdf;
  const oa = pr.openAlexId?.trim();
  if (oa) {
    const id = oa.replace(/^https:\/\/openalex\.org\//i, "");
    return `https://openalex.org/${id}`;
  }
  return "";
}

/** RAG + viewer text when no full text could be ingested (abstract + citation stub). */
export function buildPaperMetadataMarkdown(pr: PaperRecord, displayTitle: string): string {
  const lines: string[] = [];
  lines.push(`# ${displayTitle.trim() || "Research paper"}`);
  if (pr.authors?.length) lines.push(`**Authors:** ${pr.authors.join(", ")}`);
  if (pr.publicationYear != null) lines.push(`**Year:** ${pr.publicationYear}`);
  if (pr.venue?.trim()) lines.push(`**Venue:** ${pr.venue.trim()}`);
  const doi = normalizeDoi(pr.doi);
  if (doi) lines.push(`**DOI:** https://doi.org/${doi}`);
  if (pr.openAlexId?.trim()) lines.push(`**OpenAlex:** ${pr.openAlexId.trim()}`);
  if (pr.license?.trim()) lines.push(`**License:** ${pr.license.trim()}`);
  const abs = pr.abstract?.trim();
  if (abs) {
    lines.push("");
    lines.push("## Abstract");
    lines.push(abs);
  }
  lines.push("");
  lines.push(
    "_Full text was not ingested into this notebook. Use the external link on the source to open the publisher or repository version when available._"
  );
  return lines.join("\n");
}
