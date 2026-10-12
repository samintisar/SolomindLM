import type { Source } from "@/shared/types";

type FullTextSource = NonNullable<NonNullable<Source["paper"]>["fullTextSource"]>;

const VERSION_LABEL: Record<NonNullable<FullTextSource["version"]>, string> = {
  publishedVersion: "Published version",
  acceptedVersion: "Accepted manuscript",
  submittedVersion: "Preprint",
};

/** Unpaywall / OpenAlex licence slugs that aren't Creative Commons. */
const NAMED_LICENSE: Record<string, string> = {
  "publisher-specific-oa": "Publisher licence",
  "implied-oa": "Open access",
  "other-oa": "Open licence",
};

/** "cc-by-nc" → "CC BY-NC", "cc0" → "CC0"; other licence strings pass through. */
function licenseLabel(license: string): string {
  const trimmed = license.trim();
  const named = NAMED_LICENSE[trimmed.toLowerCase()];
  if (named) return named;
  if (/^cc0$/i.test(trimmed)) return "CC0";
  const m = trimmed.match(/^cc[-_ ]?(.*)$/i);
  if (!m) return trimmed;
  return m[1] ? `CC ${m[1].toUpperCase()}` : "CC";
}

/** Tooltip text for a paper's full-text source, e.g. "Accepted manuscript · CC BY". */
export function fullTextSourceLabel(source: FullTextSource | undefined): string | undefined {
  if (!source) return undefined;
  const first =
    source.method === "uploaded_pdf"
      ? "PDF you uploaded"
      : source.version
        ? VERSION_LABEL[source.version]
        : source.method === "landing_page"
          ? "Publisher page"
          : "Open-access copy";
  const second = source.license ? licenseLabel(source.license) : source.host;
  return second && source.method !== "uploaded_pdf" ? `${first} · ${second}` : first;
}
