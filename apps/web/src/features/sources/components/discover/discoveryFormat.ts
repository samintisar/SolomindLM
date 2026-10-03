import type { Source, UnifiedDiscoveryResult } from "@/shared/types/index";
import { normalizeSourceUrlForNotebookMatch } from "@/shared/utils/sourceUrlMatch";

export function getHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** Hide snippets that duplicate the title or are an obvious title-prefix repeat from APIs */
export function isSnippetMeaningful(title: string, snippet: string): boolean {
  const norm = (x: string) => x.trim().toLowerCase().replace(/\s+/g, " ");
  const t = norm(title);
  const s = norm(snippet);
  if (!s) return false;
  if (s === t) return false;
  if (t.length > 0 && t.startsWith(s)) return false;
  return true;
}

export function formatAcademicByline(r: UnifiedDiscoveryResult): string | null {
  if (r.sourceType !== "academic") return null;
  const parts: string[] = [];
  if (r.metadata.publicationYear) parts.push(String(r.metadata.publicationYear));
  else if (r.publishedDate) {
    const d = new Date(r.publishedDate);
    if (!Number.isNaN(d.getTime())) parts.push(String(d.getFullYear()));
  }
  if (r.metadata.venue) parts.push(r.metadata.venue);
  if (r.metadata.authors?.length) {
    const a = r.metadata.authors;
    parts.push(a.length > 1 ? `${a[0]} et al.` : a[0]!);
  }
  return parts.length ? parts.join(" · ") : null;
}

function normalizeDiscoveryKey(id: string): string {
  return id.replace(/^https:\/\/openalex\.org\//i, "").toLowerCase();
}

function normalizeDoiKey(doi: string | undefined): string | null {
  if (!doi?.trim()) return null;
  const d = doi
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
    .trim()
    .toLowerCase();
  return d || null;
}

export type RelevanceLevel = "high" | "medium" | "low";

export function relevanceLevel(score: number): RelevanceLevel {
  if (score >= 0.8) return "high";
  if (score >= 0.6) return "medium";
  return "low";
}

/** Access hint aligned with notebook `fulltextStatus` copy. Labels and titles match the old chips. */
export function accessInfo(r: UnifiedDiscoveryResult): { label: string; title?: string } | null {
  if (r.sourceType !== "academic") return null;
  if (r.metadata.pdfUrl?.trim()) {
    return {
      label: "OA PDF",
      title:
        "An open-access PDF is available. We try to ingest it; some repositories block automated downloads.",
    };
  }
  if (r.metadata.openAccess) return { label: "Open access" };
  if (r.metadata.landingPageUrl?.trim() || r.metadata.doi?.trim()) {
    return { label: "External access" };
  }
  return { label: "Metadata only" };
}

/** Keys (normalized URL, OpenAlex id, DOI) identifying what the notebook already holds. */
export function notebookDiscoveryKeys(sources: Source[]): Set<string> {
  const s = new Set<string>();
  for (const source of sources) {
    const u = source.url?.trim();
    if (u) s.add(normalizeSourceUrlForNotebookMatch(u));
    const oa = source.paper?.openAlexId?.trim();
    if (oa) s.add(`oa:${normalizeDiscoveryKey(oa)}`);
    const dk = normalizeDoiKey(source.paper?.doi);
    if (dk) s.add(`doi:${dk}`);
  }
  return s;
}

export function isInNotebook(r: UnifiedDiscoveryResult, keys: Set<string>): boolean {
  if (keys.has(normalizeSourceUrlForNotebookMatch(r.url))) return true;
  if (r.sourceType !== "academic") return false;
  const oa = r.metadata.openAlexId?.trim();
  if (oa && keys.has(`oa:${normalizeDiscoveryKey(oa)}`)) return true;
  const dk = normalizeDoiKey(r.metadata.doi);
  if (dk && keys.has(`doi:${dk}`)) return true;
  return false;
}
