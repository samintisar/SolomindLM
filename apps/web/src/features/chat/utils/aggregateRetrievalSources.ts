import type { ReferenceChunk } from "@/shared/types/index";

export type AggregatedRetrievalSource = {
  sourceId: string;
  title: string;
  sectionCount: number;
  /**
   * True when the model received the full document (chunkIndex -1 from retrieval expansion),
   * not a counted set of RAG sections — avoid "1 relevant section" in the activity panel.
   */
  isFullDocument: boolean;
  badgeLabel: string;
  /** When set, WEB badge opens this URL in a new tab */
  openUrl: string | null;
};

const EXT_BADGE: Record<string, string> = {
  MD: "MD",
  TXT: "TXT",
  PDF: "PDF",
  DOC: "DOC",
  DOCX: "DOCX",
  PPT: "PPT",
  PPTX: "PPTX",
  XLS: "XLS",
  XLSX: "XLSX",
  CSV: "CSV",
  JSON: "JSON",
  HTML: "WEB",
  HTM: "WEB",
};

/** Final segment is a site TLD, not a file extension (avoids "tailwindcss.com" → COM badge). */
const WEB_TLD_BADGE: Record<string, true> = {
  COM: true,
  NET: true,
  ORG: true,
  IO: true,
  CO: true,
  UK: true,
  US: true,
  DEV: true,
  APP: true,
  AI: true,
  GOV: true,
  EDU: true,
  ME: true,
  TV: true,
  CC: true,
  XYZ: true,
  SITE: true,
  ONLINE: true,
};

/**
 * Short uppercase badge for Claude-style source rows (extension, URL, or TEXT).
 */
export function inferSourceBadgeLabel(title: string): string {
  const t = title.trim();
  if (!t) return "TEXT";
  const lower = t.toLowerCase();
  if (/^https?:\/\//i.test(t)) return "WEB";
  if (
    lower.includes("youtube.com/") ||
    lower.includes("youtu.be/") ||
    lower.includes("tiktok.com/") ||
    lower.includes("instagram.com/")
  ) {
    return "WEB";
  }

  const extMatch = t.match(/\.([a-z0-9]{2,6})(?:\?|#|$)/i);
  if (extMatch) {
    const ext = extMatch[1].toUpperCase();
    if (EXT_BADGE[ext]) return EXT_BADGE[ext];
    if (WEB_TLD_BADGE[ext]) return "WEB";
    return ext.length <= 5 ? ext : "TEXT";
  }

  return "TEXT";
}

const TRAILING_FILE_EXT = new Set([
  "html",
  "htm",
  "php",
  "asp",
  "jsp",
  "cgi",
  "css",
  "js",
  "json",
  "xml",
  "svg",
  "md",
  "pdf",
  "txt",
]);

/**
 * Builds https? URL for opening web sources in a new tab.
 * Returns null when the title is not a safe navigable web address.
 */
export function deriveWebOpenUrl(title: string): string | null {
  const raw = title.trim();
  if (!raw || /[\s<>"]/.test(raw)) return null;

  try {
    const hasScheme = /^https?:\/\//i.test(raw);
    const u = hasScheme ? new URL(raw) : new URL(`https://${raw}`);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname || u.hostname.includes("..")) return null;

    if (!hasScheme) {
      const hostPart = raw
        .split("/")[0]
        .split("?")[0]
        .replace(/^www\./i, "");
      const lastSeg = hostPart.split(".").pop()?.toLowerCase() ?? "";
      if (lastSeg && TRAILING_FILE_EXT.has(lastSeg)) return null;
      if (!/^[\w.-]+\.[a-z0-9-]{2,63}$/i.test(hostPart)) return null;
    }

    return u.href;
  } catch {
    return null;
  }
}

/** Prefer stored document URL (full article link); same validation as deriveWebOpenUrl for http(s). */
export function navigableUrlFromStoredSource(raw: string | undefined | null): string | null {
  if (!raw?.trim()) return null;
  return deriveWebOpenUrl(raw);
}

/** Stable key for grouping chunks that lack documentId (legacy / edge). */
export function normalizeSourceTitleKey(title: string): string {
  let t = title.trim().toLowerCase();
  if (!t) return "_empty";
  t = t.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  const host = t.split("/")[0]?.split("?")[0]?.split("#")[0] ?? t;
  return host || t;
}

function aggregationKey(ref: ReferenceChunk): string {
  const rawDoc = ref.documentId;
  if (typeof rawDoc === "string" && rawDoc.trim().length > 0) {
    return `doc:${rawDoc.trim()}`;
  }
  const title = (ref.sourceTitle ?? "").trim() || "Document";
  return `title:${normalizeSourceTitleKey(title)}`;
}

/**
 * Groups RAG reference chunks by source for the activity panel source list.
 * Prefers `documentId` when present (one row per notebook document); otherwise falls back per chunk.
 */
export function aggregateRetrievalSources(
  references: ReferenceChunk[] | null | undefined
): AggregatedRetrievalSource[] {
  if (!references?.length) return [];

  const map = new Map<
    string,
    { title: string; count: number; sourceUrl?: string; isFullDocument: boolean }
  >();

  for (const ref of references) {
    const title = (ref.sourceTitle ?? "").trim() || "Document";
    const key = aggregationKey(ref);
    const url = ref.sourceUrl?.trim();
    const fullDoc = ref.chunkIndex === -1;

    const cur = map.get(key);
    if (cur) {
      cur.count += 1;
      cur.isFullDocument = cur.isFullDocument || fullDoc;
      if (!cur.title && title) cur.title = title;
      if (!cur.sourceUrl && url) cur.sourceUrl = url;
    } else {
      map.set(key, {
        title,
        count: 1,
        isFullDocument: fullDoc,
        ...(url ? { sourceUrl: url } : {}),
      });
    }
  }

  const rows: AggregatedRetrievalSource[] = [...map.entries()].map(
    ([sourceId, { title, count, sourceUrl, isFullDocument }]) => {
      const badgeFromTitle = inferSourceBadgeLabel(title);
      const openFromStored = navigableUrlFromStoredSource(sourceUrl);
      const openFromTitle = deriveWebOpenUrl(title);
      const openUrl = openFromStored ?? (badgeFromTitle === "WEB" ? openFromTitle : null);
      const badgeLabel = badgeFromTitle === "TEXT" && openFromStored ? "WEB" : badgeFromTitle;
      return {
        sourceId,
        title,
        sectionCount: count,
        isFullDocument,
        badgeLabel,
        openUrl,
      };
    }
  );

  rows.sort(
    (a, b) =>
      b.sectionCount - a.sectionCount ||
      a.title.localeCompare(b.title, undefined, { sensitivity: "base" })
  );

  return rows;
}
