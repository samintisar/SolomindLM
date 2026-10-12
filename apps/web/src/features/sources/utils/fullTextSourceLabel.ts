import type { Source } from "@/shared/types";

type FullTextSource = NonNullable<NonNullable<Source["paper"]>["fullTextSource"]>;

const VERSION_LABEL: Record<NonNullable<FullTextSource["version"]>, string> = {
  publishedVersion: "Published version",
  acceptedVersion: "Accepted manuscript",
  submittedVersion: "Preprint",
};

/** "cc-by-nc" → "CC BY-NC"; other licence strings pass through. */
function licenseLabel(license: string): string {
  const m = license.trim().match(/^cc[-_ ]?(.*)$/i);
  if (!m) return license.trim();
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
