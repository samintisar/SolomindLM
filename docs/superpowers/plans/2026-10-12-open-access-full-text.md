# Open-Access Full Text for Paper Sources Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Paper imports look for a legal open-access copy (Unpaywall, OpenAlex, arXiv, PubMed Central) before settling for the abstract, record which copy they used, and label abstract-only sources honestly, with actions to retry or attach a PDF.

**Architecture:** A pure resolver turns a paper's DOI / OpenAlex id into an ordered list of open-access candidates. A pure `ingestPaper` function walks a fixed ladder (stored PDF → candidates → landing page → abstract) through injected dependencies, so it is unit-tested without Convex; `embeddingJob` wires the real storage, OCR and scraper into it. Two public mutations re-run ingest; a hand-run migration fixes old labels and re-resolves old abstract-only papers.

**Tech Stack:** Convex (actions, mutations, storage, scheduler, `@convex-dev/rate-limiter`), Mistral OCR, Supadata scraping, Unpaywall + OpenAlex REST APIs, React 19 + shadcn UI, Vitest + convex-test.

**Spec:** [`docs/superpowers/specs/2026-10-12-open-access-full-text-design.md`](../specs/2026-10-12-open-access-full-text-design.md)

---

## Before you start

- Work in the worktree on branch `feature/open-access-full-text`. Read [`convex/_generated/ai/guidelines.md`](../../../convex/_generated/ai/guidelines.md) once before the first Convex change.
- Commit by path (`git commit -m "…" -- <paths>`), never a bare `git commit`; other agents may share the worktree.
- The edit hook runs Biome and the typecheck after each file edit. Typecheck failures that mention `internal.documents.paperFullText`, `internal._migration.backfillPaperFullText` or `internal.eval.openAccessCoverage` are expected until that task's codegen step runs.
- `npx convex codegen` talks to the dev deployment named in `.env.local`. It does not deploy functions.
- Never kill processes by name. Use test timeouts.

## Deviation from the spec

The spec puts an inline "Find full text" link next to the "Abstract only" hint. The hint sits inside the row's open-source `<button>`, and a button can't contain another control, so both actions live in the row's `⋯` menu only.

## File structure

**Create**

| File | Responsibility |
| --- | --- |
| `convex/_services/extraction/openAccess/fullTextTest.ts` | `countWords`, `isFullTextLength` — the "is this scraped text full text?" rule |
| `convex/_services/extraction/openAccess/OpenAccessResolver.ts` | Unpaywall + OpenAlex lookups → ordered, de-duplicated `OaCandidate[]`; contact email / user agent |
| `convex/_services/extraction/openAccess/fetchOaCandidate.ts` | Fetch one candidate URL, classify as `pdf` (with bytes) / `html` / `unusable`, 50 MB cap |
| `convex/documents/paperIngest.ts` | `ingestPaper` ladder with injected deps; `fulltextStatusAfterIngest` |
| `convex/documents/paperFullText.ts` | Public `findFullText`, `attachPdf`; internal `setPaperStorage`, `recordPaperIngest` |
| `convex/_migration/backfillPaperFullText.ts` | Relabel + re-resolve migration |
| `convex/eval/openAccessCoverage.ts` | Before/after coverage measurement on a seeded DOI sample |
| `apps/web/src/features/sources/utils/fullTextSourceLabel.ts` | "Accepted manuscript · CC BY" tooltip text |
| `apps/web/src/features/chat/utils/abstractOnlyReference.ts` | Is this citation's source an abstract-only paper? |
| Tests next to each of the above (`*.test.ts` / `*.test.tsx`) | |

**Modify**

| File | Change |
| --- | --- |
| `convex/_lib/env.ts`, `.env.example` | `OPEN_ACCESS_CONTACT_EMAIL` |
| `convex/documents/paperRecord.ts` | `fullTextSourceValidator`, `FullTextSource`, `FullTextVersion` |
| `convex/schema.ts` | `documents.fullTextSource` |
| `convex/documents/internal.ts` | `resetDocumentForReembed` helper; clears `fullTextSource` on a new upload; `getDocumentDetails` returns `fullTextSource` |
| `convex/documents/listSummary.ts` | Returns `fullTextSource` |
| `convex/documents/embeddingJob.ts` | Paper branch calls `ingestPaper` |
| `convex/_lib/rateLimits.ts` | `paperFullText` window |
| `convex/literatureReview/notebookPapers.ts`, `convex/literatureReview/db.ts` | Abstract-only papers aren't labelled "Full text (excerpt)" |
| `apps/web/src/shared/types/index.ts`, `apps/web/src/shared/utils/documentToSource.ts` | `paper.fullTextSource` |
| `apps/web/src/features/sources/components/SourceListItem.tsx`, `SourceList.tsx`, `SourcesPanel.tsx` | Labels, tooltip, menu actions, hidden PDF input |
| `apps/web/src/features/sources/services/documentsApi.ts` | `useFindPaperFullText`, `useAttachPaperPdf` |
| `apps/web/src/features/chat/components/CitationCard.tsx`, `CitationPopover.tsx`, `ChatPanel.tsx` | "Abstract only" marker |

---

### Task 1: Data model, env var, summary fields

**Files:**
- Modify: `convex/_lib/env.ts`, `.env.example`, `convex/documents/paperRecord.ts`, `convex/schema.ts`, `convex/documents/internal.ts` (`getDocumentDetails`), `convex/documents/listSummary.ts`
- Test: `convex/documents/listSummary.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `convex/documents/listSummary.test.ts`, inside the existing `describe("documents.listSummary.listSummary", …)` block:

```ts
  test("returns the open-access source a paper's full text came from", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    await t.run(async (ctx) =>
      ctx.db.insert("documents", {
        userId,
        notebookId,
        fileName: "Nanometre-scale thermometry in a living cell",
        fileType: "paper_record",
        status: "completed",
        ingestionStatus: "ingested",
        fulltextStatus: "available",
        fullTextSource: {
          method: "oa_pdf",
          url: "https://arxiv.org/pdf/1304.1068",
          version: "submittedVersion",
          host: "arxiv.org",
        },
        paperRecord: { abstract: "A", authors: [], isOa: true },
        createdAt: 1,
        updatedAt: 1,
      })
    );

    const rows = await withAuth(t, userId).query(api.documents.listSummary.listSummary, {
      notebookId,
    });

    expect(rows[0].fullTextSource).toEqual({
      method: "oa_pdf",
      url: "https://arxiv.org/pdf/1304.1068",
      version: "submittedVersion",
      host: "arxiv.org",
    });
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run test:convex convex/documents/listSummary.test.ts`
Expected: FAIL — schema validation rejects the unknown `fullTextSource` field on insert.

- [ ] **Step 3: Add the validator and types**

In `convex/documents/paperRecord.ts`, change the first import to `import { type Infer, v } from "convex/values";` and add after `ingestionStatusValidator`:

```ts
/** Open-access version, as Unpaywall and OpenAlex name it. */
export const fullTextVersionValidator = v.union(
  v.literal("publishedVersion"),
  v.literal("acceptedVersion"),
  v.literal("submittedVersion")
);

/** Where a paper source's full text came from (set only when full text was ingested). */
export const fullTextSourceValidator = v.object({
  method: v.union(
    v.literal("uploaded_pdf"),
    v.literal("oa_pdf"),
    v.literal("oa_html"),
    v.literal("landing_page")
  ),
  url: v.optional(v.string()),
  version: v.optional(fullTextVersionValidator),
  license: v.optional(v.string()),
  host: v.optional(v.string()),
});

export type FullTextVersion = Infer<typeof fullTextVersionValidator>;
export type FullTextSource = Infer<typeof fullTextSourceValidator>;
```

- [ ] **Step 4: Add the schema field**

In `convex/schema.ts`, add `fullTextSourceValidator` to the existing import from `./documents/paperRecord`, then in the `documents` table, directly after the `ingestionStatus` line:

```ts
    /** Paper full text provenance: uploaded PDF, open-access PDF/HTML, or landing page. Absent = abstract only. */
    fullTextSource: v.optional(fullTextSourceValidator),
```

- [ ] **Step 5: Return it from `getDocumentDetails` and `listSummary`**

In `convex/documents/internal.ts`, `getDocumentDetails` handler, add after `ingestionStatus: doc.ingestionStatus,`:

```ts
      fullTextSource: doc.fullTextSource,
```

In `convex/documents/listSummary.ts`, extend the import to `import { fullTextSourceValidator, fulltextStatusValidator, ingestionStatusValidator } from "./paperRecord";`, add to `documentSummaryValidator` after `ingestionStatus`:

```ts
  fullTextSource: v.optional(fullTextSourceValidator),
```

and to `toDocumentSummary` after `ingestionStatus: doc.ingestionStatus,`:

```ts
    fullTextSource: doc.fullTextSource,
```

- [ ] **Step 6: Add the env var**

In `convex/_lib/env.ts`, under `// Academic APIs` after `PUBMED_EMAIL`:

```ts
  /** Contact email sent to Unpaywall (required) and OpenAlex (polite pool) when resolving open-access copies. */
  OPEN_ACCESS_CONTACT_EMAIL: process.env.OPEN_ACCESS_CONTACT_EMAIL || "support@solomindlm.com",
```

In `.env.example`, after the `PUBMED_EMAIL=you@example.com` line:

```
# Contact email for Unpaywall / OpenAlex open-access lookups (optional; defaults in code if unset)
OPEN_ACCESS_CONTACT_EMAIL=you@example.com
```

- [ ] **Step 7: Run the test and typecheck**

Run: `bun run test:convex convex/documents/listSummary.test.ts`
Expected: PASS (all tests in the file).

Run: `bun run typecheck:convex`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add convex/_lib/env.ts .env.example convex/documents/paperRecord.ts convex/schema.ts convex/documents/internal.ts convex/documents/listSummary.ts convex/documents/listSummary.test.ts
git commit -m "feat(sources): record where a paper's full text came from (#480)" -- convex/_lib/env.ts .env.example convex/documents/paperRecord.ts convex/schema.ts convex/documents/internal.ts convex/documents/listSummary.ts convex/documents/listSummary.test.ts
```

---

### Task 2: Full-text length test

**Files:**
- Create: `convex/_services/extraction/openAccess/fullTextTest.ts`
- Test: `convex/_services/extraction/openAccess/fullTextTest.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { countWords, FULL_TEXT_MIN_WORDS, isFullTextLength } from "./fullTextTest";

const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");

describe("countWords", () => {
  it("counts whitespace-separated words, ignoring surrounding and repeated whitespace", () => {
    expect(countWords("  one\ttwo\n\nthree  ")).toBe(3);
    expect(countWords("")).toBe(0);
    expect(countWords("   ")).toBe(0);
  });
});

describe("isFullTextLength", () => {
  it("rejects text shorter than the minimum", () => {
    expect(isFullTextLength(words(FULL_TEXT_MIN_WORDS - 1), "")).toBe(false);
  });

  it("accepts text at the minimum when there is no abstract", () => {
    expect(isFullTextLength(words(FULL_TEXT_MIN_WORDS), undefined)).toBe(true);
  });

  it("needs at least three times the abstract's length", () => {
    const abstract = words(600);
    expect(isFullTextLength(words(1_700), abstract)).toBe(false);
    expect(isFullTextLength(words(1_800), abstract)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run test:convex convex/_services/extraction/openAccess/fullTextTest.test.ts`
Expected: FAIL — cannot resolve `./fullTextTest`.

- [ ] **Step 3: Implement**

```ts
/**
 * The rule for "is this scraped page the paper's full text?" (#480). A landing page or paywall
 * usually carries the abstract and some navigation; a full article is far longer than both.
 * OCR of a real PDF doesn't go through this test.
 */

export const FULL_TEXT_MIN_WORDS = 1_500;
export const FULL_TEXT_ABSTRACT_MULTIPLE = 3;

export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

export function isFullTextLength(text: string, abstract: string | undefined): boolean {
  const n = countWords(text);
  return (
    n >= FULL_TEXT_MIN_WORDS && n >= FULL_TEXT_ABSTRACT_MULTIPLE * countWords(abstract ?? "")
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `bun run test:convex convex/_services/extraction/openAccess/fullTextTest.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add convex/_services/extraction/openAccess/fullTextTest.ts convex/_services/extraction/openAccess/fullTextTest.test.ts
git commit -m "feat(sources): rule for when a scraped page counts as full text (#480)" -- convex/_services/extraction/openAccess/fullTextTest.ts convex/_services/extraction/openAccess/fullTextTest.test.ts
```

---

### Task 3: Open-access candidate resolver

**Files:**
- Create: `convex/_services/extraction/openAccess/OpenAccessResolver.ts`
- Test: `convex/_services/extraction/openAccess/OpenAccessResolver.test.ts`

Response shapes (checked against the live APIs on 2026-10-12):
- Unpaywall `GET https://api.unpaywall.org/v2/{doi}?email=…` → `{ oa_locations: [{ url_for_pdf, url_for_landing_page, url, version, license, host_type, pmh_id }] }`; unknown DOI → HTTP 404.
- OpenAlex `GET https://api.openalex.org/works/doi:{doi}?select=ids,locations&mailto=…` → `{ ids: { pmcid? }, locations: [{ is_oa, pdf_url, landing_page_url, version, license }] }`. `ids.pmcid` and PMC URLs carry the number with or without the `PMC` prefix (`https://www.ncbi.nlm.nih.gov/pmc/articles/4221854`).
- arXiv PDFs download directly. PMC / Europe PMC PDF endpoints return 403 or an HTML stub to servers, but the PMC article page (`https://pmc.ncbi.nlm.nih.gov/articles/PMC{n}/`) is full HTML text, so PMC copies become HTML candidates.

- [ ] **Step 1: Write the failing tests**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  candidateKey,
  candidatesFromLocations,
  resolveOpenAccessCandidates,
} from "./OpenAccessResolver";

describe("candidatesFromLocations", () => {
  it("orders by version (published, accepted, submitted, unknown), PDF before HTML", () => {
    const out = candidatesFromLocations(
      [
        { pdfUrl: "https://repo.example.org/preprint.pdf", version: "submittedVersion" },
        { pdfUrl: "https://journal.example.com/article.pdf", version: "publishedVersion", license: "cc-by" },
        { landingUrl: "https://www.ncbi.nlm.nih.gov/pmc/articles/4221854", version: "acceptedVersion" },
        { pdfUrl: "https://uni.example.edu/accepted.pdf", version: "acceptedVersion" },
        { pdfUrl: "https://mirror.example.net/unknown.pdf" },
      ],
      []
    );
    expect(out.map((c) => [c.url, c.kind, c.version])).toEqual([
      ["https://journal.example.com/article.pdf", "pdf", "publishedVersion"],
      ["https://uni.example.edu/accepted.pdf", "pdf", "acceptedVersion"],
      ["https://pmc.ncbi.nlm.nih.gov/articles/PMC4221854/", "html", "acceptedVersion"],
      ["https://repo.example.org/preprint.pdf", "pdf", "submittedVersion"],
      ["https://mirror.example.net/unknown.pdf", "pdf", undefined],
    ]);
    expect(out[0]).toMatchObject({ license: "cc-by", host: "journal.example.com" });
  });

  it("turns arXiv locations into the arXiv PDF, from the URL or the OAI id", () => {
    const out = candidatesFromLocations(
      [
        { landingUrl: "http://arxiv.org/abs/1304.1068v2", version: "submittedVersion" },
        { pmhId: "oai:arXiv.org:hep-th/9901001", version: "submittedVersion" },
      ],
      []
    );
    expect(out.map((c) => c.url)).toEqual([
      "https://arxiv.org/pdf/1304.1068v2",
      "https://arxiv.org/pdf/hep-th/9901001",
    ]);
    expect(out.every((c) => c.kind === "pdf")).toBe(true);
  });

  it("turns a PMC id (bare or from a PMC PDF URL) into the PMC article page", () => {
    const out = candidatesFromLocations(
      [{ pdfUrl: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC777/pdf/", version: "publishedVersion" }],
      ["https://www.ncbi.nlm.nih.gov/pmc/articles/888"]
    );
    expect(out.map((c) => [c.url, c.kind])).toEqual([
      ["https://pmc.ncbi.nlm.nih.gov/articles/PMC777/", "html"],
      ["https://pmc.ncbi.nlm.nih.gov/articles/PMC888/", "html"],
    ]);
  });

  it("drops duplicates, keeping the version and licence another copy knew", () => {
    const out = candidatesFromLocations(
      [
        { pdfUrl: "http://journal.example.com/article.pdf#page=1" },
        { pdfUrl: "https://journal.example.com/article.pdf", version: "publishedVersion", license: "cc-by" },
      ],
      []
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      url: "https://journal.example.com/article.pdf",
      version: "publishedVersion",
      license: "cc-by",
    });
  });

  it("includes the record's own pdfUrl, matched to a known location's version", () => {
    const out = candidatesFromLocations(
      [{ pdfUrl: "https://journal.example.com/article.pdf", version: "publishedVersion" }],
      [],
      "https://journal.example.com/article.pdf"
    );
    expect(out).toHaveLength(1);
    expect(out[0].version).toBe("publishedVersion");
  });

  it("ignores non-http URLs", () => {
    expect(candidatesFromLocations([{ pdfUrl: "ftp://x.example/a.pdf" }], [])).toEqual([]);
  });
});

describe("candidateKey", () => {
  it("ignores scheme, case of host, trailing slash and fragment", () => {
    expect(candidateKey("http://PMC.ncbi.nlm.nih.gov/articles/PMC1/#x")).toBe(
      candidateKey("https://pmc.ncbi.nlm.nih.gov/articles/PMC1")
    );
  });
});

describe("resolveOpenAccessCandidates", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function route(routes: Record<string, { status: number; body?: unknown }>) {
    mockFetch.mockImplementation(async (url: string) => {
      const key = Object.keys(routes).find((k) => String(url).includes(k));
      const r = key ? routes[key] : { status: 404 };
      return new Response(r.body === undefined ? null : JSON.stringify(r.body), { status: r.status });
    });
  }

  it("merges Unpaywall and OpenAlex locations and sends a contact email to both", async () => {
    route({
      "api.unpaywall.org/v2/10.1038/nature12373": {
        status: 200,
        body: {
          oa_locations: [
            {
              url_for_pdf: "https://www.nature.com/articles/nature12373.pdf",
              url_for_landing_page: "https://doi.org/10.1038/nature12373",
              version: "publishedVersion",
              license: null,
            },
            { url_for_pdf: "https://arxiv.org/pdf/1304.1068", version: "submittedVersion", pmh_id: "oai:arXiv.org:1304.1068" },
          ],
        },
      },
      "api.openalex.org/works/doi:10.1038/nature12373": {
        status: 200,
        body: {
          ids: { pmcid: "https://www.ncbi.nlm.nih.gov/pmc/articles/4221854" },
          locations: [
            { is_oa: true, pdf_url: "https://www.nature.com/articles/nature12373.pdf", version: "publishedVersion" },
            { is_oa: false, landing_page_url: "https://pubmed.ncbi.nlm.nih.gov/23903748" },
          ],
        },
      },
    });

    const out = await resolveOpenAccessCandidates({ doi: "https://doi.org/10.1038/nature12373" });

    expect(out.map((c) => c.url)).toEqual([
      "https://www.nature.com/articles/nature12373.pdf",
      "https://arxiv.org/pdf/1304.1068",
      "https://pmc.ncbi.nlm.nih.gov/articles/PMC4221854/",
    ]);
    const urls = mockFetch.mock.calls.map(([u]) => String(u));
    expect(urls.find((u) => u.includes("unpaywall"))).toMatch(/[?&]email=[^&]+%40/);
    expect(urls.find((u) => u.includes("openalex"))).toMatch(/[?&]mailto=[^&]+%40/);
  });

  it("looks a paper up on OpenAlex by id when it has no DOI, and skips Unpaywall", async () => {
    route({
      "api.openalex.org/works/W2159974629": {
        status: 200,
        body: { locations: [{ is_oa: true, pdf_url: "https://repo.example.org/a.pdf" }] },
      },
    });
    const out = await resolveOpenAccessCandidates({ openAlexId: "https://openalex.org/W2159974629" });
    expect(out.map((c) => c.url)).toEqual(["https://repo.example.org/a.pdf"]);
    expect(mockFetch.mock.calls.some(([u]) => String(u).includes("unpaywall"))).toBe(false);
  });

  it("falls back to the record's pdfUrl when both lookups fail", async () => {
    route({
      "api.unpaywall.org": { status: 404 },
      "api.openalex.org": { status: 503 },
    });
    const out = await resolveOpenAccessCandidates({
      doi: "10.1/x",
      pdfUrl: "https://repo.example.org/x.pdf",
    });
    expect(out.map((c) => c.url)).toEqual(["https://repo.example.org/x.pdf"]);
  });

  it("retries a 429 once, then gives up without throwing", async () => {
    route({ "api.unpaywall.org": { status: 429 }, "api.openalex.org": { status: 429 } });
    const out = await resolveOpenAccessCandidates({ doi: "10.1/y" });
    expect(out).toEqual([]);
    expect(mockFetch.mock.calls.filter(([u]) => String(u).includes("unpaywall"))).toHaveLength(2);
  });

  it("makes no requests without a DOI or OpenAlex id", async () => {
    const out = await resolveOpenAccessCandidates({ pdfUrl: "https://arxiv.org/pdf/2005.11401" });
    expect(mockFetch).not.toHaveBeenCalled();
    expect(out.map((c) => c.url)).toEqual(["https://arxiv.org/pdf/2005.11401"]);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test:convex convex/_services/extraction/openAccess/OpenAccessResolver.test.ts`
Expected: FAIL — cannot resolve `./OpenAccessResolver`.

- [ ] **Step 3: Implement**

```ts
/**
 * Finds legal open-access copies of a paper (#480): Unpaywall and OpenAlex locations by DOI (or
 * OpenAlex id), plus the arXiv PDF and PubMed Central article page those locations point to.
 * Returns candidates best-first: published version, then accepted manuscript, then preprint, then
 * unknown; PDF before HTML within a version. Never throws: a failed lookup gives no candidates.
 */

import { invokeWithHttpRetry } from "../../../_agents/_shared/retry";
import { env } from "../../../_lib/env";
import { ExternalServiceError } from "../../../_lib/errors";
import { createServiceLogger } from "../../../_lib/logging/serviceLogger";
import { type FullTextVersion, normalizeDoi } from "../../../documents/paperRecord";

export interface OaResolverInput {
  doi?: string;
  openAlexId?: string;
  pdfUrl?: string;
}

export interface OaCandidate {
  url: string;
  kind: "pdf" | "html";
  version?: FullTextVersion;
  license?: string;
  host: string;
}

/** One open-access location, from either API, in a common shape. */
export interface OaLocation {
  pdfUrl?: string | null;
  landingUrl?: string | null;
  version?: string | null;
  license?: string | null;
  pmhId?: string | null;
}

const LOOKUP_TIMEOUT_MS = 10_000;

const VERSION_RANK: Record<FullTextVersion, number> = {
  publishedVersion: 0,
  acceptedVersion: 1,
  submittedVersion: 2,
};

export function openAccessUserAgent(): string {
  return `SolomindLM/1.0 (mailto:${env.OPEN_ACCESS_CONTACT_EMAIL})`;
}

/** https URL with the fragment removed, or null for anything that isn't http(s). */
function cleanUrl(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    u.protocol = "https:";
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

/** Comparison key: scheme, host case, trailing slash and fragment don't make a different copy. */
export function candidateKey(raw: string): string {
  const cleaned = cleanUrl(raw) ?? raw.trim();
  return cleaned.replace(/\/+$/, "").toLowerCase();
}

function asVersion(v: string | null | undefined): FullTextVersion | undefined {
  return v && v in VERSION_RANK ? (v as FullTextVersion) : undefined;
}

function arxivIdFromUrl(url: string | null | undefined): string | undefined {
  const m = url?.split(/[?#]/)[0].match(/arxiv\.org\/(?:abs|pdf)\/(.+?)(?:\.pdf)?\/?$/i);
  return m?.[1];
}

function arxivIdFromPmh(pmhId: string | null | undefined): string | undefined {
  return pmhId?.match(/^oai:arXiv\.org:(.+)$/i)?.[1];
}

function pmcNumberFromUrl(url: string | null | undefined): string | undefined {
  return url?.match(/(?:\/pmc\/articles\/|pmc\.ncbi\.nlm\.nih\.gov\/articles\/)(?:PMC)?(\d+)/i)?.[1];
}

function pmcNumberFromPmh(pmhId: string | null | undefined): string | undefined {
  return pmhId?.match(/^oai:pubmedcentral\.nih\.gov:(\d+)$/i)?.[1];
}

const pmcArticleUrl = (n: string) => `https://pmc.ncbi.nlm.nih.gov/articles/PMC${n}/`;

/** Ordered, de-duplicated candidates from locations, PMC ids, and the record's own PDF link. */
export function candidatesFromLocations(
  locations: OaLocation[],
  pmcIds: string[],
  recordPdfUrl?: string
): OaCandidate[] {
  const byKey = new Map<string, OaCandidate>();

  const add = (raw: string, kind: OaCandidate["kind"], loc?: OaLocation) => {
    const url = cleanUrl(raw);
    if (!url) return;
    const key = candidateKey(url);
    const version = asVersion(loc?.version);
    const license = loc?.license?.trim() || undefined;
    const existing = byKey.get(key);
    if (existing) {
      existing.version ??= version;
      existing.license ??= license;
      return;
    }
    byKey.set(key, { url, kind, version, license, host: new URL(url).hostname.toLowerCase() });
  };

  const addLocation = (loc: OaLocation) => {
    const arxivId =
      arxivIdFromUrl(loc.pdfUrl) ?? arxivIdFromUrl(loc.landingUrl) ?? arxivIdFromPmh(loc.pmhId);
    if (arxivId) {
      add(`https://arxiv.org/pdf/${arxivId}`, "pdf", loc);
      return;
    }
    const pmc =
      pmcNumberFromUrl(loc.pdfUrl) ?? pmcNumberFromUrl(loc.landingUrl) ?? pmcNumberFromPmh(loc.pmhId);
    if (pmc) {
      // PMC blocks server PDF downloads; its article page holds the full text.
      add(pmcArticleUrl(pmc), "html", loc);
      return;
    }
    if (loc.pdfUrl) add(loc.pdfUrl, "pdf", loc);
  };

  for (const loc of locations) addLocation(loc);
  for (const id of pmcIds) {
    const n = pmcNumberFromUrl(id) ?? id.match(/^(?:PMC)?(\d+)$/i)?.[1];
    if (n) add(pmcArticleUrl(n), "html");
  }
  if (recordPdfUrl) addLocation({ pdfUrl: recordPdfUrl });

  const rank = (c: OaCandidate) => (c.version ? VERSION_RANK[c.version] : 3) * 2 + (c.kind === "pdf" ? 0 : 1);
  return [...byKey.values()]
    .map((c, i) => ({ c, i }))
    .sort((a, b) => rank(a.c) - rank(b.c) || a.i - b.i)
    .map(({ c }) => c);
}

/** GET JSON with one retry on 429/5xx; 404 means "not known" and returns null. */
async function fetchJson<T>(url: string, service: string): Promise<T | null> {
  return invokeWithHttpRetry(
    async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
      try {
        const res = await fetch(url, {
          headers: { Accept: "application/json", "User-Agent": openAccessUserAgent() },
          signal: controller.signal,
        });
        if (res.status === 404) return null;
        if (!res.ok) {
          throw new ExternalServiceError(service, `${service} lookup failed: HTTP ${res.status}`, {
            statusCode: res.status,
            endpoint: url,
          });
        }
        return (await res.json()) as T;
      } finally {
        clearTimeout(timer);
      }
    },
    `${service}_lookup`,
    { maxAttempts: 2, baseDelayMs: 250 }
  );
}

const encodeDoi = (doi: string) => doi.split("/").map(encodeURIComponent).join("/");

type UnpaywallResponse = {
  oa_locations?: Array<{
    url_for_pdf?: string | null;
    url_for_landing_page?: string | null;
    url?: string | null;
    version?: string | null;
    license?: string | null;
    pmh_id?: string | null;
  }>;
};

async function unpaywallLocations(doi: string): Promise<OaLocation[]> {
  const email = encodeURIComponent(env.OPEN_ACCESS_CONTACT_EMAIL);
  const data = await fetchJson<UnpaywallResponse>(
    `https://api.unpaywall.org/v2/${encodeDoi(doi)}?email=${email}`,
    "unpaywall"
  );
  return (data?.oa_locations ?? []).map((l) => ({
    pdfUrl: l.url_for_pdf,
    landingUrl: l.url_for_landing_page ?? l.url,
    version: l.version,
    license: l.license,
    pmhId: l.pmh_id,
  }));
}

type OpenAlexWork = {
  ids?: { pmcid?: string | null };
  locations?: Array<{
    is_oa?: boolean;
    pdf_url?: string | null;
    landing_page_url?: string | null;
    version?: string | null;
    license?: string | null;
  }>;
};

async function openAlexLocations(
  doi: string | undefined,
  openAlexKey: string | undefined
): Promise<{ locations: OaLocation[]; pmcIds: string[] }> {
  const path = doi ? `doi:${encodeDoi(doi)}` : encodeURIComponent(openAlexKey ?? "");
  const mailto = encodeURIComponent(env.OPEN_ACCESS_CONTACT_EMAIL);
  const data = await fetchJson<OpenAlexWork>(
    `https://api.openalex.org/works/${path}?select=ids,locations&mailto=${mailto}`,
    "openalex"
  );
  return {
    locations: (data?.locations ?? [])
      .filter((l) => l.is_oa !== false)
      .map((l) => ({
        pdfUrl: l.pdf_url,
        landingUrl: l.landing_page_url,
        version: l.version,
        license: l.license,
      })),
    pmcIds: data?.ids?.pmcid ? [data.ids.pmcid] : [],
  };
}

function openAlexKeyFrom(id: string | undefined): string | undefined {
  const key = id?.trim().replace(/^https?:\/\/openalex\.org\//i, "");
  return key || undefined;
}

export async function resolveOpenAccessCandidates(input: OaResolverInput): Promise<OaCandidate[]> {
  const logger = createServiceLogger("open_access", "resolve");
  const doi = normalizeDoi(input.doi);
  const openAlexKey = openAlexKeyFrom(input.openAlexId);

  const [unpaywall, openAlex] = await Promise.all([
    doi
      ? unpaywallLocations(doi).catch((error) => {
          logger.operationError(error, { api: "unpaywall", doi });
          return [] as OaLocation[];
        })
      : Promise.resolve([] as OaLocation[]),
    doi || openAlexKey
      ? openAlexLocations(doi, openAlexKey).catch((error) => {
          logger.operationError(error, { api: "openalex", doi, openAlexKey });
          return { locations: [] as OaLocation[], pmcIds: [] as string[] };
        })
      : Promise.resolve({ locations: [] as OaLocation[], pmcIds: [] as string[] }),
  ]);

  const candidates = candidatesFromLocations(
    [...unpaywall, ...openAlex.locations],
    openAlex.pmcIds,
    input.pdfUrl
  );
  logger.operationComplete({ doi, openAlexKey, candidates: candidates.length });
  return candidates;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run test:convex convex/_services/extraction/openAccess/OpenAccessResolver.test.ts`
Expected: PASS (12 tests). The 429 test takes about 250 ms for the retry.

- [ ] **Step 5: Commit**

```bash
git add convex/_services/extraction/openAccess/OpenAccessResolver.ts convex/_services/extraction/openAccess/OpenAccessResolver.test.ts
git commit -m "feat(sources): resolve open-access copies via Unpaywall and OpenAlex (#480)" -- convex/_services/extraction/openAccess/OpenAccessResolver.ts convex/_services/extraction/openAccess/OpenAccessResolver.test.ts
```

---

### Task 4: Fetch and classify a candidate

**Files:**
- Create: `convex/_services/extraction/openAccess/fetchOaCandidate.ts`
- Test: `convex/_services/extraction/openAccess/fetchOaCandidate.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchOaCandidate, MAX_PDF_BYTES } from "./fetchOaCandidate";

const mockFetch = vi.fn();
const enc = new TextEncoder();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchOaCandidate", () => {
  it("returns the bytes of a real PDF", async () => {
    mockFetch.mockResolvedValue(
      new Response(enc.encode("%PDF-1.7\n...body..."), {
        status: 200,
        headers: { "content-type": "application/pdf" },
      })
    );
    const out = await fetchOaCandidate("https://arxiv.org/pdf/1304.1068");
    expect(out.type).toBe("pdf");
    if (out.type === "pdf") expect(new TextDecoder().decode(out.bytes)).toBe("%PDF-1.7\n...body...");
    expect(mockFetch.mock.calls[0][1].headers["User-Agent"]).toMatch(/^SolomindLM\/1\.0 \(mailto:/);
  });

  it("calls a .pdf URL that serves an HTML page html, not pdf", async () => {
    mockFetch.mockResolvedValue(
      new Response("<!DOCTYPE html><html><title>Article</title></html>", {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      })
    );
    const out = await fetchOaCandidate("https://www.nature.com/articles/nature12373.pdf");
    expect(out).toEqual({ type: "html", finalUrl: "https://www.nature.com/articles/nature12373.pdf" });
  });

  it("sniffs HTML when the content type is missing", async () => {
    mockFetch.mockResolvedValue(new Response("  \n<html><body>x</body></html>", { status: 200 }));
    expect((await fetchOaCandidate("https://x.example/a")).type).toBe("html");
  });

  it("rejects other content as unusable", async () => {
    mockFetch.mockResolvedValue(
      new Response("PK\u0003\u0004zip", { status: 200, headers: { "content-type": "application/zip" } })
    );
    const out = await fetchOaCandidate("https://x.example/a.zip");
    expect(out).toMatchObject({ type: "unusable" });
  });

  it("rejects non-2xx responses", async () => {
    mockFetch.mockResolvedValue(new Response("Forbidden", { status: 403 }));
    expect(await fetchOaCandidate("https://europepmc.org/x")).toEqual({
      type: "unusable",
      reason: "HTTP 403",
    });
  });

  it("rejects a declared size over the cap without reading the body", async () => {
    mockFetch.mockResolvedValue(
      new Response(enc.encode("%PDF-1.7"), {
        status: 200,
        headers: { "content-length": String(MAX_PDF_BYTES + 1) },
      })
    );
    expect(await fetchOaCandidate("https://x.example/big.pdf")).toEqual({
      type: "unusable",
      reason: "too_large",
    });
  });

  it("stops reading a PDF that grows past the cap", async () => {
    const chunk = new Uint8Array(1024 * 1024);
    chunk.set(enc.encode("%PDF-1.7"));
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent > MAX_PDF_BYTES) controller.close();
        else {
          controller.enqueue(sent === 0 ? chunk : new Uint8Array(1024 * 1024));
          sent += 1024 * 1024;
        }
      },
    });
    mockFetch.mockResolvedValue(new Response(body, { status: 200 }));
    expect(await fetchOaCandidate("https://x.example/huge.pdf")).toEqual({
      type: "unusable",
      reason: "too_large",
    });
  });

  it("reports network errors and timeouts as unusable instead of throwing", async () => {
    mockFetch.mockRejectedValue(new Error("ECONNRESET"));
    expect(await fetchOaCandidate("https://x.example/a.pdf")).toEqual({
      type: "unusable",
      reason: "ECONNRESET",
    });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test:convex convex/_services/extraction/openAccess/fetchOaCandidate.test.ts`
Expected: FAIL — cannot resolve `./fetchOaCandidate`.

- [ ] **Step 3: Implement**

```ts
/**
 * Downloads one open-access candidate (#480) and says what it really is. A `.pdf` URL often
 * serves an HTML article page or a bot wall, so the body is sniffed, not trusted from the URL.
 */

import { openAccessUserAgent } from "./OpenAccessResolver";

/** Mistral OCR accepts documents up to 50 MB. */
export const MAX_PDF_BYTES = 50 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 30_000;
const SNIFF_BYTES = 1024;

export type FetchedCandidate =
  | { type: "pdf"; bytes: Uint8Array<ArrayBuffer>; finalUrl: string }
  | { type: "html"; finalUrl: string }
  | { type: "unusable"; reason: string };

function head(bytes: Uint8Array): string {
  return new TextDecoder("latin1").decode(bytes.subarray(0, SNIFF_BYTES));
}

export async function fetchOaCandidate(
  url: string,
  timeoutMs = FETCH_TIMEOUT_MS
): Promise<FetchedCandidate> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": openAccessUserAgent(),
        Accept: "application/pdf,text/html;q=0.9,*/*;q=0.5",
      },
    });
    if (!res.ok) {
      await res.body?.cancel();
      return { type: "unusable", reason: `HTTP ${res.status}` };
    }
    const finalUrl = res.url || url;
    const declared = Number(res.headers.get("content-length") ?? "");
    if (Number.isFinite(declared) && declared > MAX_PDF_BYTES) {
      await res.body?.cancel();
      return { type: "unusable", reason: "too_large" };
    }
    if (!res.body) return { type: "unusable", reason: "empty body" };

    const reader = res.body.getReader();
    const first = await reader.read();
    if (first.done || !first.value?.byteLength) return { type: "unusable", reason: "empty body" };

    const start = head(first.value);
    if (!start.includes("%PDF-")) {
      await reader.cancel();
      const contentType = res.headers.get("content-type") ?? "";
      return contentType.includes("html") || start.trimStart().startsWith("<")
        ? { type: "html", finalUrl }
        : { type: "unusable", reason: `not a PDF (${contentType || "unknown type"})` };
    }

    const parts: Uint8Array[] = [first.value];
    let total = first.value.byteLength;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_PDF_BYTES) {
        await reader.cancel();
        return { type: "unusable", reason: "too_large" };
      }
      parts.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
      bytes.set(part, offset);
      offset += part.byteLength;
    }
    return { type: "pdf", bytes, finalUrl };
  } catch (error) {
    return { type: "unusable", reason: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run test:convex convex/_services/extraction/openAccess/fetchOaCandidate.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add convex/_services/extraction/openAccess/fetchOaCandidate.ts convex/_services/extraction/openAccess/fetchOaCandidate.test.ts
git commit -m "feat(sources): download and sniff open-access candidates (#480)" -- convex/_services/extraction/openAccess/fetchOaCandidate.ts convex/_services/extraction/openAccess/fetchOaCandidate.test.ts
```

---

### Task 5: The ingest ladder

**Files:**
- Create: `convex/documents/paperIngest.ts`
- Test: `convex/documents/paperIngest.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it, vi } from "vitest";
import type { OaCandidate } from "../_services/extraction/openAccess/OpenAccessResolver";
import {
  CANDIDATE_BUDGET_MS,
  fulltextStatusAfterIngest,
  ingestPaper,
  MAX_CANDIDATE_ATTEMPTS,
  type PaperIngestDeps,
  type PaperIngestInput,
} from "./paperIngest";

const longText = Array.from({ length: 2_000 }, (_, i) => `w${i}`).join(" ");
const pdfBytes = new TextEncoder().encode("%PDF-1.7") as Uint8Array<ArrayBuffer>;

const input = (over: Partial<PaperIngestInput> = {}): PaperIngestInput => ({
  title: "Nanometre-scale thermometry",
  paperRecord: { abstract: "Short abstract.", authors: ["Kucsko, G."], doi: "10.1038/nature12373", isOa: true },
  fileUrl: "https://doi.org/10.1038/nature12373",
  ...over,
});

const candidate = (over: Partial<OaCandidate> = {}): OaCandidate => ({
  url: "https://arxiv.org/pdf/1304.1068",
  kind: "pdf",
  version: "submittedVersion",
  host: "arxiv.org",
  ...over,
});

function makeDeps(over: Partial<PaperIngestDeps> = {}): PaperIngestDeps {
  return {
    resolveCandidates: vi.fn().mockResolvedValue([]),
    fetchCandidate: vi.fn().mockResolvedValue({ type: "unusable", reason: "HTTP 403" }),
    attachPdf: vi.fn().mockResolvedValue("storage_new"),
    detachPdf: vi.fn().mockResolvedValue(undefined),
    ocrStoredPdf: vi.fn().mockResolvedValue("OCR text"),
    scrape: vi.fn().mockResolvedValue({ title: "Page", content: "too short" }),
    now: () => 0,
    ...over,
  };
}

const logger = { info: vi.fn(), warn: vi.fn() };

describe("ingestPaper", () => {
  it("OCRs a stored PDF first and keeps its recorded source", async () => {
    const deps = makeDeps();
    const out = await ingestPaper(
      input({ storageId: "storage_1", fullTextSource: { method: "oa_pdf", host: "arxiv.org" } }),
      deps,
      logger
    );
    expect(out).toEqual({
      outcome: "full_text",
      content: "OCR text",
      fullTextSource: { method: "oa_pdf", host: "arxiv.org" },
    });
    expect(deps.ocrStoredPdf).toHaveBeenCalledWith("storage_1");
    expect(deps.resolveCandidates).not.toHaveBeenCalled();
  });

  it("records a stored PDF with no recorded source as uploaded", async () => {
    const out = await ingestPaper(input({ storageId: "storage_1" }), makeDeps(), logger);
    expect(out).toMatchObject({ outcome: "full_text", fullTextSource: { method: "uploaded_pdf" } });
  });

  it("stores and OCRs the first open-access PDF", async () => {
    const deps = makeDeps({
      resolveCandidates: vi.fn().mockResolvedValue([candidate({ license: "cc-by" })]),
      fetchCandidate: vi.fn().mockResolvedValue({ type: "pdf", bytes: pdfBytes, finalUrl: "https://arxiv.org/pdf/1304.1068" }),
    });
    const out = await ingestPaper(input(), deps, logger);
    expect(deps.resolveCandidates).toHaveBeenCalledWith({
      doi: "10.1038/nature12373",
      openAlexId: undefined,
      pdfUrl: undefined,
    });
    expect(deps.attachPdf).toHaveBeenCalledWith(pdfBytes);
    expect(deps.ocrStoredPdf).toHaveBeenCalledWith("storage_new");
    expect(out).toEqual({
      outcome: "full_text",
      content: "OCR text",
      fullTextSource: {
        method: "oa_pdf",
        url: "https://arxiv.org/pdf/1304.1068",
        version: "submittedVersion",
        license: "cc-by",
        host: "arxiv.org",
      },
    });
  });

  it("deletes a stored candidate PDF whose OCR fails, then tries the next candidate", async () => {
    const deps = makeDeps({
      resolveCandidates: vi.fn().mockResolvedValue([
        candidate({ url: "https://a.example/1.pdf", host: "a.example" }),
        candidate({ url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC1/", kind: "html", host: "pmc.ncbi.nlm.nih.gov" }),
      ]),
      fetchCandidate: vi
        .fn()
        .mockResolvedValueOnce({ type: "pdf", bytes: pdfBytes, finalUrl: "https://a.example/1.pdf" })
        .mockResolvedValueOnce({ type: "html", finalUrl: "https://pmc.ncbi.nlm.nih.gov/articles/PMC1/" }),
      ocrStoredPdf: vi.fn().mockResolvedValue("   "),
      scrape: vi.fn().mockResolvedValue({ title: "PMC article", content: longText }),
    });
    const out = await ingestPaper(input(), deps, logger);
    expect(deps.detachPdf).toHaveBeenCalledWith("storage_new");
    expect(out).toMatchObject({
      outcome: "full_text",
      content: longText,
      title: "PMC article",
      fullTextSource: { method: "oa_html", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC1/" },
    });
  });

  it("scrapes a PDF URL that served HTML, and rejects it when it's abstract-sized", async () => {
    const deps = makeDeps({
      resolveCandidates: vi.fn().mockResolvedValue([candidate({ url: "https://journal.example/a.pdf" })]),
      fetchCandidate: vi.fn().mockResolvedValue({ type: "html", finalUrl: "https://journal.example/a" }),
      scrape: vi.fn().mockResolvedValue({ title: "Paywall", content: "Buy this article" }),
    });
    const out = await ingestPaper(input({ fileUrl: undefined }), deps, logger);
    expect(deps.scrape).toHaveBeenCalledWith("https://journal.example/a");
    expect(out.outcome).toBe("abstract_only");
  });

  it("stops after the attempt limit", async () => {
    const many = Array.from({ length: MAX_CANDIDATE_ATTEMPTS + 3 }, (_, i) =>
      candidate({ url: `https://m.example/${i}.pdf`, host: "m.example" })
    );
    const deps = makeDeps({ resolveCandidates: vi.fn().mockResolvedValue(many) });
    await ingestPaper(input({ fileUrl: undefined }), deps, logger);
    expect(deps.fetchCandidate).toHaveBeenCalledTimes(MAX_CANDIDATE_ATTEMPTS);
  });

  it("stops when the time budget is spent", async () => {
    let t = 0;
    const deps = makeDeps({
      resolveCandidates: vi.fn().mockResolvedValue([candidate(), candidate({ url: "https://b.example/2.pdf" })]),
      fetchCandidate: vi.fn().mockImplementation(async () => {
        t += CANDIDATE_BUDGET_MS;
        return { type: "unusable", reason: "slow" };
      }),
      now: () => t,
    });
    await ingestPaper(input({ fileUrl: undefined }), deps, logger);
    expect(deps.fetchCandidate).toHaveBeenCalledTimes(1);
  });

  it("accepts a long landing page when no candidate works", async () => {
    const deps = makeDeps({ scrape: vi.fn().mockResolvedValue({ title: "Article", content: longText }) });
    const out = await ingestPaper(input(), deps, logger);
    expect(deps.scrape).toHaveBeenCalledWith("https://doi.org/10.1038/nature12373");
    expect(out).toMatchObject({
      outcome: "full_text",
      fullTextSource: { method: "landing_page", url: "https://doi.org/10.1038/nature12373", host: "doi.org" },
    });
  });

  it("doesn't scrape the landing page twice when it was already a candidate", async () => {
    const deps = makeDeps({
      resolveCandidates: vi.fn().mockResolvedValue([
        candidate({ url: "https://doi.org/10.1038/nature12373", kind: "html", host: "doi.org" }),
      ]),
      fetchCandidate: vi.fn().mockResolvedValue({ type: "html", finalUrl: "https://doi.org/10.1038/nature12373" }),
    });
    await ingestPaper(input(), deps, logger);
    expect(deps.scrape).toHaveBeenCalledTimes(1);
  });

  it("falls back to the abstract stub, surviving thrown OCR and scrape errors", async () => {
    const deps = makeDeps({
      resolveCandidates: vi.fn().mockResolvedValue([candidate()]),
      fetchCandidate: vi.fn().mockResolvedValue({ type: "pdf", bytes: pdfBytes, finalUrl: "x" }),
      ocrStoredPdf: vi.fn().mockRejectedValue(new Error("Mistral 500")),
      scrape: vi.fn().mockRejectedValue(new Error("Supadata down")),
    });
    const out = await ingestPaper(input(), deps, logger);
    expect(out.outcome).toBe("abstract_only");
    expect(out.content).toContain("## Abstract");
    expect(out.content).toContain("Short abstract.");
    expect(out.content).toContain("Full text was not ingested");
  });
});

describe("fulltextStatusAfterIngest", () => {
  it("is available after full text, keeps external_only, otherwise unavailable", () => {
    expect(fulltextStatusAfterIngest("full_text", "external_only")).toBe("available");
    expect(fulltextStatusAfterIngest("abstract_only", "external_only")).toBe("external_only");
    expect(fulltextStatusAfterIngest("abstract_only", "available")).toBe("unavailable");
    expect(fulltextStatusAfterIngest("abstract_only", undefined)).toBe("unavailable");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test:convex convex/documents/paperIngest.test.ts`
Expected: FAIL — cannot resolve `./paperIngest`.

- [ ] **Step 3: Implement**

```ts
/**
 * How a paper source gets its text (#480). Stops at the first step that yields full text:
 *   1. a PDF already stored on the source (uploaded, or found by an earlier import), OCR'd;
 *   2. open-access candidates, best version first: PDFs are stored and OCR'd, HTML pages scraped;
 *   3. the landing page, scraped;
 *   4. otherwise the title + abstract stub, marked abstract only.
 * Scraped text must pass `isFullTextLength`. All I/O comes in through `deps`, so this is unit-tested
 * without Convex; `embeddingJob` supplies the real storage, OCR and scraper.
 */

import type { FetchedCandidate } from "../_services/extraction/openAccess/fetchOaCandidate";
import { isFullTextLength } from "../_services/extraction/openAccess/fullTextTest";
import type {
  OaCandidate,
  OaResolverInput,
} from "../_services/extraction/openAccess/OpenAccessResolver";
import { buildPaperMetadataMarkdown, type FullTextSource, type PaperRecord } from "./paperRecord";

export const MAX_CANDIDATE_ATTEMPTS = 6;
/** Keeps the whole embedding job well inside Convex's 600 s action limit. */
export const CANDIDATE_BUDGET_MS = 180_000;

export interface PaperIngestInput {
  title: string;
  paperRecord: PaperRecord;
  fileUrl?: string;
  storageId?: string;
  fullTextSource?: FullTextSource;
}

export interface PaperIngestDeps {
  resolveCandidates(input: OaResolverInput): Promise<OaCandidate[]>;
  fetchCandidate(url: string): Promise<FetchedCandidate>;
  /** Stores PDF bytes, points the document at them (replacing any earlier PDF), returns the storage id. */
  attachPdf(bytes: Uint8Array<ArrayBuffer>): Promise<string>;
  /** Deletes a stored PDF and clears the document's storage id. */
  detachPdf(storageId: string): Promise<void>;
  ocrStoredPdf(storageId: string): Promise<string>;
  scrape(url: string): Promise<{ title?: string; content: string }>;
  now(): number;
}

export interface IngestLogger {
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
}

export type PaperIngestResult =
  | { outcome: "full_text"; content: string; title?: string; fullTextSource: FullTextSource }
  | { outcome: "abstract_only"; content: string };

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Drops undefined fields so the object is a valid Convex value. */
function compactSource(source: FullTextSource): FullTextSource {
  return Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined)
  ) as FullTextSource;
}

function hostOf(url: string): string | undefined {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

async function ocrText(
  deps: PaperIngestDeps,
  storageId: string,
  logger: IngestLogger
): Promise<string | null> {
  try {
    const text = (await deps.ocrStoredPdf(storageId)).trim();
    if (!text) logger.warn("PDF OCR returned no text", { storageId });
    return text || null;
  } catch (e) {
    logger.warn("PDF OCR failed", { storageId, error: errorMessage(e) });
    return null;
  }
}

async function fullTextPage(
  deps: PaperIngestDeps,
  url: string,
  abstract: string,
  logger: IngestLogger
): Promise<{ title?: string; content: string } | null> {
  try {
    const page = await deps.scrape(url);
    if (isFullTextLength(page.content, abstract)) return page;
    logger.info("Scraped page is too short to be the full text", {
      url,
      contentLength: page.content.length,
    });
  } catch (e) {
    logger.warn("Scrape failed", { url, error: errorMessage(e) });
  }
  return null;
}

async function tryCandidate(
  candidate: OaCandidate,
  abstract: string,
  deps: PaperIngestDeps,
  logger: IngestLogger
): Promise<PaperIngestResult | null> {
  const fetched = await deps.fetchCandidate(candidate.url);
  const provenance = {
    url: candidate.url,
    version: candidate.version,
    license: candidate.license,
    host: candidate.host,
  };

  if (fetched.type === "pdf") {
    let storageId: string;
    try {
      storageId = await deps.attachPdf(fetched.bytes);
    } catch (e) {
      logger.warn("Storing open-access PDF failed", { url: candidate.url, error: errorMessage(e) });
      return null;
    }
    const text = await ocrText(deps, storageId, logger);
    if (text) {
      return {
        outcome: "full_text",
        content: text,
        fullTextSource: compactSource({ method: "oa_pdf", ...provenance }),
      };
    }
    await deps.detachPdf(storageId).catch((e) =>
      logger.warn("Deleting unreadable PDF failed", { storageId, error: errorMessage(e) })
    );
    return null;
  }

  if (fetched.type === "html") {
    const page = await fullTextPage(deps, fetched.finalUrl, abstract, logger);
    if (!page) return null;
    return {
      outcome: "full_text",
      content: page.content,
      title: page.title,
      fullTextSource: compactSource({ method: "oa_html", ...provenance, url: fetched.finalUrl }),
    };
  }

  logger.info("Open-access candidate unusable", { url: candidate.url, reason: fetched.reason });
  return null;
}

export async function ingestPaper(
  input: PaperIngestInput,
  deps: PaperIngestDeps,
  logger: IngestLogger
): Promise<PaperIngestResult> {
  const pr = input.paperRecord;
  const abstract = pr.abstract ?? "";

  // 1. A PDF already on the source.
  if (input.storageId) {
    const text = await ocrText(deps, input.storageId, logger);
    if (text) {
      return {
        outcome: "full_text",
        content: text,
        fullTextSource: input.fullTextSource ?? { method: "uploaded_pdf" },
      };
    }
  }

  // 2. Open-access candidates.
  const tried = new Set<string>();
  const started = deps.now();
  const candidates = await deps.resolveCandidates({
    doi: pr.doi,
    openAlexId: pr.openAlexId,
    pdfUrl: pr.pdfUrl,
  });
  let attempts = 0;
  for (const candidate of candidates) {
    if (attempts >= MAX_CANDIDATE_ATTEMPTS || deps.now() - started >= CANDIDATE_BUDGET_MS) {
      logger.info("Stopped trying open-access candidates", { attempts, candidates: candidates.length });
      break;
    }
    attempts++;
    tried.add(candidate.url);
    const result = await tryCandidate(candidate, abstract, deps, logger);
    if (result) {
      logger.info("Paper full text found", { method: result.outcome === "full_text" ? result.fullTextSource.method : undefined, url: candidate.url, attempts });
      return result;
    }
  }

  // 3. The landing page.
  const landing = input.fileUrl?.trim() || pr.landingPageUrl?.trim();
  if (landing && !tried.has(landing)) {
    const page = await fullTextPage(deps, landing, abstract, logger);
    if (page) {
      return {
        outcome: "full_text",
        content: page.content,
        title: page.title,
        fullTextSource: compactSource({ method: "landing_page", url: landing, host: hostOf(landing) }),
      };
    }
  }

  // 4. Abstract only.
  logger.info("No full text found; storing the abstract", { attempts, candidates: candidates.length });
  return { outcome: "abstract_only", content: buildPaperMetadataMarkdown(pr, input.title) };
}

export function fulltextStatusAfterIngest(
  outcome: PaperIngestResult["outcome"],
  previous: "available" | "unavailable" | "external_only" | undefined
): "available" | "unavailable" | "external_only" {
  if (outcome === "full_text") return "available";
  return previous === "external_only" ? "external_only" : "unavailable";
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run test:convex convex/documents/paperIngest.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add convex/documents/paperIngest.ts convex/documents/paperIngest.test.ts
git commit -m "feat(sources): paper ingest ladder - stored PDF, open access, landing page, abstract (#480)" -- convex/documents/paperIngest.ts convex/documents/paperIngest.test.ts
```

---

### Task 6: Internal mutations, reset helper, rate limit

**Files:**
- Modify: `convex/documents/internal.ts` (`prepareDocumentReembed` → `resetDocumentForReembed`), `convex/_lib/rateLimits.ts`
- Create: `convex/documents/paperFullText.ts` (internal half; public half in Task 8)
- Test: `convex/documents/paperFullText.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
/// <reference types="vite/client" />
import rateLimiterTest, { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { preloadModules } from "../_testing/preloadModules.helpers";
import schema from "../schema";

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);
preloadModules(modules, ["./documents/paperFullText.ts", "./documents/internal.ts"]);

type DocFields = Partial<Omit<Doc<"documents">, "_id" | "_creationTime">>;
preloadModules(rateLimiterTest.modules, ["./component/lib.ts"]);

type T = ReturnType<typeof convexTest>;

function makeT(): T {
  const t = convexTest(schema, modules);
  registerRateLimiter(t);
  return t;
}

async function seedPaper(
  t: T,
  over: DocFields = {}
): Promise<{ userId: Id<"users">; notebookId: Id<"notebooks">; documentId: Id<"documents"> }> {
  return t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name: "Test" });
    const notebookId = await ctx.db.insert("notebooks", {
      userId,
      title: "Notebook",
      createdAt: 1,
      updatedAt: 1,
    });
    const documentId = await ctx.db.insert("documents", {
      userId,
      notebookId,
      fileName: "A paper",
      fileType: "paper_record",
      status: "completed",
      ingestionStatus: "metadata_only",
      fulltextStatus: "unavailable",
      paperRecord: { abstract: "Abstract.", authors: [], doi: "10.1/x", isOa: false },
      createdAt: 1,
      updatedAt: 1,
      ...over,
    });
    return { userId, notebookId, documentId };
  });
}

describe("documents.paperFullText internal", () => {
  test("recordPaperIngest sets the outcome and clears an old source when none is given", async () => {
    const t = makeT();
    const { documentId } = await seedPaper(t, {
      fullTextSource: { method: "landing_page", url: "https://old.example" },
    });

    await t.mutation(internal.documents.paperFullText.recordPaperIngest, {
      documentId,
      ingestionStatus: "metadata_only",
      fulltextStatus: "unavailable",
    });

    const doc = await t.run((ctx) => ctx.db.get(documentId));
    expect(doc?.ingestionStatus).toBe("metadata_only");
    expect(doc?.fullTextSource).toBeUndefined();
  });

  test("recordPaperIngest stores the full-text source", async () => {
    const t = makeT();
    const { documentId } = await seedPaper(t);
    await t.mutation(internal.documents.paperFullText.recordPaperIngest, {
      documentId,
      ingestionStatus: "ingested",
      fulltextStatus: "available",
      fullTextSource: { method: "oa_pdf", host: "arxiv.org" },
    });
    const doc = await t.run((ctx) => ctx.db.get(documentId));
    expect(doc).toMatchObject({
      ingestionStatus: "ingested",
      fulltextStatus: "available",
      fullTextSource: { method: "oa_pdf", host: "arxiv.org" },
    });
  });

  test("setPaperStorage sets and clears the storage id", async () => {
    const t = makeT();
    const { documentId } = await seedPaper(t);
    const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["%PDF-1.7"])));

    await t.mutation(internal.documents.paperFullText.setPaperStorage, { documentId, storageId });
    expect((await t.run((ctx) => ctx.db.get(documentId)))?.storageId).toBe(storageId);

    await t.mutation(internal.documents.paperFullText.setPaperStorage, { documentId });
    expect((await t.run((ctx) => ctx.db.get(documentId)))?.storageId).toBeUndefined();
  });

  test("prepareDocumentReembed keeps fullTextSource unless a new PDF replaces the old one", async () => {
    const t = makeT();
    const { documentId } = await seedPaper(t, {
      ingestionStatus: "ingested",
      fullTextSource: { method: "oa_pdf", host: "arxiv.org" },
    });

    await t.mutation(internal.documents.internal.prepareDocumentReembed, { documentId, delayMs: 0 });
    let doc = await t.run((ctx) => ctx.db.get(documentId));
    expect(doc).toMatchObject({ status: "pending", ingestionStatus: "pending" });
    expect(doc?.fullTextSource).toEqual({ method: "oa_pdf", host: "arxiv.org" });

    const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["%PDF-1.7"])));
    await t.mutation(internal.documents.internal.prepareDocumentReembed, {
      documentId,
      delayMs: 0,
      newStorageId: storageId,
    });
    doc = await t.run((ctx) => ctx.db.get(documentId));
    expect(doc?.storageId).toBe(storageId);
    expect(doc?.fullTextSource).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test:convex convex/documents/paperFullText.test.ts`
Expected: FAIL — `internal.documents.paperFullText` is undefined.

- [ ] **Step 3: Extract `resetDocumentForReembed` in `internal.ts`**

Replace the whole `prepareDocumentReembed` definition in `convex/documents/internal.ts` with:

```ts
/**
 * Clear chunks, optionally swap the Convex storage blob, reset doc fields, schedule embedding.
 * A new blob also clears `fullTextSource` (an uploaded PDF replaces whatever was there); a plain
 * reprocess keeps it, so a stored open-access PDF keeps its provenance.
 */
export async function resetDocumentForReembed(
  ctx: MutationCtx,
  args: { documentId: Id<"documents">; delayMs: number; newStorageId?: string }
): Promise<void> {
  const doc = await ctx.db.get(args.documentId);
  if (!doc) throw new Error("Document not found");

  if (args.newStorageId !== undefined) {
    if (doc.storageId) {
      await ctx.storage.delete(doc.storageId as Id<"_storage">);
    }
    await ctx.db.patch(args.documentId, {
      storageId: args.newStorageId,
      fullTextSource: undefined,
      updatedAt: Date.now(),
    });
  }

  await deleteAllChunksForDocument(ctx, args.documentId);

  const before = await ctx.db.get(args.documentId);
  await ctx.db.patch(args.documentId, {
    status: "pending",
    error: undefined,
    wordCount: undefined,
    estimatedReadingTimeMinutes: undefined,
    totalPages: undefined,
    totalChunks: undefined,
    hasCodeBlocks: undefined,
    hasMathNotation: undefined,
    hasTables: undefined,
    hasImages: undefined,
    language: undefined,
    documentStructure: undefined,
    maxHeadingLevel: undefined,
    metadata: undefined,
    extractedMarkdown: undefined,
    ...(before?.fileType === "paper_record" ? { ingestionStatus: "pending" as const } : {}),
    updatedAt: Date.now(),
  });

  const after = await ctx.db.get(args.documentId);
  if (!after) throw new Error("Document not found");

  await ctx.scheduler.runAfter(args.delayMs, internal.documents.embeddingJob.docEmbedding, {
    documentId: args.documentId,
    userId: after.userId,
    notebookId: after.notebookId,
  });
}

/**
 * Internal: Clear chunks, optionally swap Convex storage blob, reset doc fields, schedule embedding.
 */
export const prepareDocumentReembed = internalMutation({
  args: {
    documentId: v.id("documents"),
    delayMs: v.number(),
    newStorageId: v.optional(v.string()),
  },
  handler: async (ctx, args) => resetDocumentForReembed(ctx, args),
});
```

Before replacing, diff the field list in the new patch against the current one (`git diff` after the edit) and keep any field the current code resets that isn't listed above.

- [ ] **Step 4: Add the rate limit window**

In `convex/_lib/rateLimits.ts`, in `RATE_LIMIT_CONFIG` after `feedbackSubmit`:

```ts
  /** "Find full text" / "Upload PDF" on a paper source (per user, per hour); each re-runs OCR and lookups */
  paperFullText: { kind: "fixed window", rate: 20, period: HOUR },
```

- [ ] **Step 5: Create the internal mutations**

`convex/documents/paperFullText.ts`:

```ts
/**
 * Open-access full text for paper sources (#480): mutations the embedding job uses to record
 * what it found, and (Task 8) the user actions to look again or attach a PDF.
 */

import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import {
  fullTextSourceValidator,
  fulltextStatusValidator,
  ingestionStatusValidator,
} from "./paperRecord";

/** Sets or (with no `storageId`) clears a paper source's stored PDF. Doesn't delete blobs. */
export const setPaperStorage = internalMutation({
  args: { documentId: v.id("documents"), storageId: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.documentId, { storageId: args.storageId, updatedAt: Date.now() });
    return null;
  },
});

/** Records an ingest outcome. A missing `fullTextSource` clears the old one (abstract only). */
export const recordPaperIngest = internalMutation({
  args: {
    documentId: v.id("documents"),
    ingestionStatus: ingestionStatusValidator,
    fulltextStatus: fulltextStatusValidator,
    fullTextSource: v.optional(fullTextSourceValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.documentId, {
      ingestionStatus: args.ingestionStatus,
      fulltextStatus: args.fulltextStatus,
      fullTextSource: args.fullTextSource,
      updatedAt: Date.now(),
    });
    return null;
  },
});
```

- [ ] **Step 6: Regenerate the API and run the tests**

Run: `npx convex codegen`
Expected: completes; `convex/_generated/api.d.ts` now lists `documents/paperFullText`, `documents/paperIngest` and the `openAccess` modules.

Run: `bun run test:convex convex/documents/paperFullText.test.ts`
Expected: PASS (4 tests).

Run: `bun run test:convex convex/documents`
Expected: PASS (existing reprocess tests still pass).

- [ ] **Step 7: Commit**

```bash
git add convex/documents/internal.ts convex/_lib/rateLimits.ts convex/documents/paperFullText.ts convex/documents/paperFullText.test.ts convex/_generated
git commit -m "feat(sources): internal mutations to record a paper's ingest outcome (#480)" -- convex/documents/internal.ts convex/_lib/rateLimits.ts convex/documents/paperFullText.ts convex/documents/paperFullText.test.ts convex/_generated
```

---

### Task 7: Wire the ladder into the embedding job

**Files:**
- Modify: `convex/documents/embeddingJob.ts`

No unit test: the ladder is covered by Task 5; this task is wiring, verified by typecheck here and end-to-end in Task 14.

- [ ] **Step 1: Replace the `paper_record` branch**

In `convex/documents/embeddingJob.ts`, replace everything from `} else if (docDetails.fileType === "paper_record") {` up to (not including) the blank line before `if (!extractedText || extractedText.trim().length === 0) {` with:

```ts
      } else if (docDetails.fileType === "paper_record") {
        logger.info(
          "Processing paper_record (stored PDF → open-access copies → landing page → abstract)"
        );
        const pr = docDetails.paperRecord;
        if (!pr) {
          throw new Error("paper_record document missing paperRecord");
        }

        let currentStorageId = docDetails.storageId;
        const result = await ingestPaper(
          {
            title: docDetails.fileName || "Research paper",
            paperRecord: pr,
            fileUrl: docDetails.fileUrl,
            storageId: docDetails.storageId,
            fullTextSource: docDetails.fullTextSource,
          },
          {
            resolveCandidates: resolveOpenAccessCandidates,
            fetchCandidate: (url) => fetchOaCandidate(url),
            attachPdf: async (bytes) => {
              const storageId = await ctx.storage.store(
                new Blob([bytes], { type: "application/pdf" })
              );
              const previous = currentStorageId;
              await ctx.runMutation(internal.documents.paperFullText.setPaperStorage, {
                documentId,
                storageId,
              });
              currentStorageId = storageId;
              if (previous && previous !== storageId) {
                await ctx.storage.delete(previous as Id<"_storage">);
              }
              return storageId;
            },
            detachPdf: async (storageId) => {
              await ctx.runMutation(internal.documents.paperFullText.setPaperStorage, {
                documentId,
              });
              currentStorageId = undefined;
              await ctx.storage.delete(storageId as Id<"_storage">);
            },
            ocrStoredPdf: async (storageId) => {
              const url = await ctx.storage.getUrl(storageId as Id<"_storage">);
              if (!url) throw new Error("Stored PDF not found");
              return mistralOCR.processDocument(url);
            },
            scrape: (url) =>
              ctx.runAction(internal._services.extractors.scrapeWebPageInternal, { url }),
            now: () => Date.now(),
          },
          logger
        );

        extractedText = result.content;
        if (result.outcome === "full_text" && result.title?.trim()) {
          extractedTitle = result.title.trim();
        }
        await ctx.runMutation(internal.documents.paperFullText.recordPaperIngest, {
          documentId,
          ingestionStatus: result.outcome === "full_text" ? "ingested" : "metadata_only",
          fulltextStatus: fulltextStatusAfterIngest(result.outcome, docDetails.fulltextStatus),
          ...(result.outcome === "full_text" ? { fullTextSource: result.fullTextSource } : {}),
        });
        logger.phaseComplete("extraction", {
          contentLength: extractedText.length,
          outcome: result.outcome,
          method: result.outcome === "full_text" ? result.fullTextSource.method : "abstract",
        });
      }
```

- [ ] **Step 2: Fix imports and remove the old loader**

Run: `grep -n "academicLoader\|AcademicLoaderService\|buildPaperMetadataMarkdown" convex/documents/embeddingJob.ts`

If the only remaining hits are the import lines and the `const academicLoader = new AcademicLoaderService(…)` block, delete them. Then add these imports (keep the existing import order Biome expects; it will sort on save):

```ts
import type { Id } from "../_generated/dataModel";
import { fetchOaCandidate } from "../_services/extraction/openAccess/fetchOaCandidate";
import { resolveOpenAccessCandidates } from "../_services/extraction/openAccess/OpenAccessResolver";
import { fulltextStatusAfterIngest, ingestPaper } from "./paperIngest";
```

- [ ] **Step 3: Typecheck and run the document tests**

Run: `bun run typecheck:convex`
Expected: no errors. If `logger` doesn't satisfy `IngestLogger`, check `createJobLogger`'s `info` / `warn` signatures in `convex/_agents/_shared/logging.ts` and widen `IngestLogger` to match rather than casting.

Run: `bun run test:convex convex/documents convex/_services/extraction`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add convex/documents/embeddingJob.ts
git commit -m "feat(sources): paper imports look for open-access full text before the abstract (#480)" -- convex/documents/embeddingJob.ts
```

---

### Task 8: "Find full text" and "Upload PDF" mutations

**Files:**
- Modify: `convex/documents/paperFullText.ts`
- Test: `convex/documents/paperFullText.test.ts`

- [ ] **Step 1: Write the failing tests**

Add `api` to the `../_generated/api` import in `convex/documents/paperFullText.test.ts`, add this helper below `seedPaper`:

```ts
function asUser(t: T, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId as string}|session1` });
}
```

and append:

```ts
describe("documents.paperFullText.findFullText", () => {
  test("resets an abstract-only paper for another ingest", async () => {
    const t = makeT();
    const { userId, documentId } = await seedPaper(t);
    await asUser(t, userId).mutation(api.documents.paperFullText.findFullText, { documentId });
    const doc = await t.run((ctx) => ctx.db.get(documentId));
    expect(doc).toMatchObject({ status: "pending", ingestionStatus: "pending" });
  });

  test("rejects another user's paper", async () => {
    const t = makeT();
    const { documentId } = await seedPaper(t);
    const stranger = await t.run((ctx) => ctx.db.insert("users", { name: "Other" }));
    await expect(
      asUser(t, stranger).mutation(api.documents.paperFullText.findFullText, { documentId })
    ).rejects.toThrow();
  });

  test("rejects sources that aren't papers, and papers still processing", async () => {
    const t = makeT();
    const { userId, documentId } = await seedPaper(t, { fileType: "url" });
    await expect(
      asUser(t, userId).mutation(api.documents.paperFullText.findFullText, { documentId })
    ).rejects.toThrow();

    const busy = await seedPaper(t, { status: "processing" });
    await expect(
      asUser(t, busy.userId).mutation(api.documents.paperFullText.findFullText, {
        documentId: busy.documentId,
      })
    ).rejects.toThrow();
  });

  test("is rate limited per user", async () => {
    const t = makeT();
    const { userId, documentId } = await seedPaper(t);
    for (let i = 0; i < 20; i++) {
      await t.run((ctx) => ctx.db.patch(documentId, { status: "completed" }));
      await asUser(t, userId).mutation(api.documents.paperFullText.findFullText, { documentId });
    }
    await t.run((ctx) => ctx.db.patch(documentId, { status: "completed" }));
    await expect(
      asUser(t, userId).mutation(api.documents.paperFullText.findFullText, { documentId })
    ).rejects.toThrow();
  });
});

describe("documents.paperFullText.attachPdf", () => {
  test("attaches a PDF and re-ingests from it", async () => {
    const t = makeT();
    const { userId, documentId } = await seedPaper(t);
    const storageId = await t.run((ctx) =>
      ctx.storage.store(new Blob(["%PDF-1.7"], { type: "application/pdf" }))
    );

    const res = await asUser(t, userId).mutation(api.documents.paperFullText.attachPdf, {
      documentId,
      storageId,
    });

    expect(res).toEqual({ ok: true });
    const doc = await t.run((ctx) => ctx.db.get(documentId));
    expect(doc).toMatchObject({ storageId, status: "pending", ingestionStatus: "pending" });
  });

  test("refuses a file that isn't a PDF and deletes the upload", async () => {
    const t = makeT();
    const { userId, documentId } = await seedPaper(t);
    const storageId = await t.run((ctx) =>
      ctx.storage.store(new Blob(["hello"], { type: "text/plain" }))
    );

    const res = await asUser(t, userId).mutation(api.documents.paperFullText.attachPdf, {
      documentId,
      storageId,
    });

    expect(res).toEqual({ ok: false, reason: "Choose a PDF file." });
    expect(await t.run((ctx) => ctx.db.system.get(storageId))).toBeNull();
    expect((await t.run((ctx) => ctx.db.get(documentId)))?.storageId).toBeUndefined();
  });

  test("rejects another user's paper without touching the upload", async () => {
    const t = makeT();
    const { documentId } = await seedPaper(t);
    const stranger = await t.run((ctx) => ctx.db.insert("users", { name: "Other" }));
    const storageId = await t.run((ctx) =>
      ctx.storage.store(new Blob(["%PDF-1.7"], { type: "application/pdf" }))
    );
    await expect(
      asUser(t, stranger).mutation(api.documents.paperFullText.attachPdf, { documentId, storageId })
    ).rejects.toThrow();
    expect(await t.run((ctx) => ctx.db.system.get(storageId))).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test:convex convex/documents/paperFullText.test.ts`
Expected: FAIL — `api.documents.paperFullText.findFullText` is undefined.

- [ ] **Step 3: Implement**

In `convex/documents/paperFullText.ts`, replace the imports with:

```ts
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, type MutationCtx, mutation } from "../_generated/server";
import { InputValidationError } from "../_lib/errors";
import { assertCanEditNotebook } from "../_lib/notebookAccess";
import { rateLimiter } from "../_lib/rateLimits";
import { toConvexError } from "../_lib/serviceErrors";
import { MAX_PDF_BYTES } from "../_services/extraction/openAccess/fetchOaCandidate";
import { getAuthUserId } from "../auth";
import { resetDocumentForReembed } from "./internal";
import {
  fullTextSourceValidator,
  fulltextStatusValidator,
  ingestionStatusValidator,
} from "./paperRecord";
```

and append:

```ts
const RATE_LIMITED = "You've looked for full text often in the last hour. Try again later.";

const userError = (message: string) => toConvexError(new InputValidationError(message));

/** The caller's paper source, if they can edit it and it isn't mid-ingest. */
async function editablePaper(
  ctx: MutationCtx,
  documentId: Id<"documents">
): Promise<{ userId: Id<"users">; doc: Doc<"documents"> }> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Unauthenticated");
  const doc = await ctx.db.get(documentId);
  if (!doc) throw new Error("Document not found");
  await assertCanEditNotebook(ctx, doc.notebookId, userId);
  if (doc.fileType !== "paper_record") throw userError("Only paper sources have this option.");
  if (doc.status === "pending" || doc.status === "processing") {
    throw userError("This source is still being processed.");
  }
  return { userId, doc };
}

/** Looks for open-access full text again (re-runs the whole paper ingest). */
export const findFullText = mutation({
  args: { documentId: v.id("documents") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { userId } = await editablePaper(ctx, args.documentId);
    const { ok } = await rateLimiter.limit(ctx, "paperFullText", { key: userId });
    if (!ok) throw userError(RATE_LIMITED);
    await resetDocumentForReembed(ctx, { documentId: args.documentId, delayMs: 0 });
    return null;
  },
});

/**
 * Attaches a PDF the user uploaded to a paper source and re-ingests from it. Invalid uploads are
 * deleted and reported in the result (throwing would roll the delete back).
 */
export const attachPdf = mutation({
  args: { documentId: v.id("documents"), storageId: v.id("_storage") },
  returns: v.union(
    v.object({ ok: v.literal(true) }),
    v.object({ ok: v.literal(false), reason: v.string() })
  ),
  handler: async (ctx, args) => {
    const { userId } = await editablePaper(ctx, args.documentId);

    const reject = async (reason: string) => {
      await ctx.storage.delete(args.storageId);
      return { ok: false as const, reason };
    };

    const file = await ctx.db.system.get(args.storageId);
    if (!file) return { ok: false as const, reason: "The upload didn't arrive. Try again." };
    if (file.contentType !== "application/pdf") return reject("Choose a PDF file.");
    if (file.size > MAX_PDF_BYTES) return reject("That PDF is over 50 MB.");

    const { ok } = await rateLimiter.limit(ctx, "paperFullText", { key: userId });
    if (!ok) return reject(RATE_LIMITED);

    await resetDocumentForReembed(ctx, {
      documentId: args.documentId,
      delayMs: 0,
      newStorageId: args.storageId,
    });
    return { ok: true as const };
  },
});
```

- [ ] **Step 4: Regenerate and run the tests**

Run: `npx convex codegen`
Expected: completes.

Run: `bun run test:convex convex/documents/paperFullText.test.ts`
Expected: PASS (11 tests).

Run: `bun run typecheck:convex`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add convex/documents/paperFullText.ts convex/documents/paperFullText.test.ts convex/_generated
git commit -m "feat(sources): find full text again or attach a PDF to a paper source (#480)" -- convex/documents/paperFullText.ts convex/documents/paperFullText.test.ts convex/_generated
```

---

### Task 9: Literature review stops calling an abstract "Full text"

**Files:**
- Modify: `convex/literatureReview/notebookPapers.ts`, `convex/literatureReview/db.ts`
- Test: `convex/literatureReview/notebookPapers.test.ts`

- [ ] **Step 1: Write the failing test**

Add to the `describe("notebookPaperText", …)` block in `convex/literatureReview/notebookPapers.test.ts`:

```ts
  it("returns nothing for an abstract-only paper, so extraction labels it Abstract", () => {
    expect(
      notebookPaperText({
        fileType: "paper_record",
        ingestionStatus: "metadata_only",
        extractedMarkdown: "# Title\n\n## Abstract\nAn abstract.",
        paperRecord: { abstract: "An abstract." },
      })
    ).toBe("");
  });

  it("returns the full text of an ingested paper", () => {
    expect(
      notebookPaperText({
        fileType: "paper_record",
        ingestionStatus: "ingested",
        extractedMarkdown: "Full article text",
      })
    ).toBe("Full article text");
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun run test:convex convex/literatureReview/notebookPapers.test.ts`
Expected: FAIL — the abstract-only case returns the stub text (and `ingestionStatus` is not a known property, a type error vitest ignores).

- [ ] **Step 3: Implement**

In `convex/literatureReview/notebookPapers.ts`, add to `NotebookDocumentLike` after `extractedMarkdown?: string;`:

```ts
  ingestionStatus?: string;
```

and replace `notebookPaperText` with:

```ts
/**
 * The full text extraction reads for a notebook paper, or "" when it has none — the caller then
 * uses the abstract and labels it as such. A paper source holding only its abstract stub counts
 * as having none (#480).
 */
export function notebookPaperText(
  doc: Pick<NotebookDocumentLike, "extractedMarkdown" | "paperRecord" | "ingestionStatus"> & {
    fileType?: string;
  }
): string {
  if (doc.fileType === "paper_record" && doc.ingestionStatus !== "ingested") return "";
  const text = startOfText(doc.extractedMarkdown, NOTEBOOK_PAPER_TEXT_MAX_CHARS);
  return text || (doc.paperRecord?.abstract ?? "").trim();
}
```

In `convex/literatureReview/db.ts`, `getNotebookPaperText`, pass the two new fields:

```ts
    return notebookPaperText({
      extractedMarkdown: doc.extractedMarkdown?.slice(0, NOTEBOOK_PAPER_TEXT_MAX_CHARS),
      paperRecord: doc.paperRecord,
      fileType: doc.fileType,
      ingestionStatus: doc.ingestionStatus,
    });
```

- [ ] **Step 4: Run the tests**

Run: `bun run test:convex convex/literatureReview`
Expected: PASS.

Run: `bun run typecheck:convex`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add convex/literatureReview/notebookPapers.ts convex/literatureReview/db.ts convex/literatureReview/notebookPapers.test.ts
git commit -m "fix(literature-review): don't label an abstract-only paper's stub as full text (#480)" -- convex/literatureReview/notebookPapers.ts convex/literatureReview/db.ts convex/literatureReview/notebookPapers.test.ts
```

---

### Task 10: Web types, labels and tooltip

**Files:**
- Modify: `apps/web/src/shared/types/index.ts`, `apps/web/src/shared/utils/documentToSource.ts`, `apps/web/src/features/sources/components/SourceListItem.tsx`
- Create: `apps/web/src/features/sources/utils/fullTextSourceLabel.ts`
- Test: `apps/web/src/features/sources/utils/fullTextSourceLabel.test.ts`, `apps/web/src/shared/utils/documentToSource.test.ts`, `apps/web/src/features/sources/components/SourceListItem.test.tsx`

- [ ] **Step 1: Write the failing tests**

`apps/web/src/features/sources/utils/fullTextSourceLabel.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { fullTextSourceLabel } from "./fullTextSourceLabel";

describe("fullTextSourceLabel", () => {
  it("names the version and licence", () => {
    expect(fullTextSourceLabel({ method: "oa_pdf", version: "acceptedVersion", license: "cc-by" })).toBe(
      "Accepted manuscript · CC BY"
    );
    expect(fullTextSourceLabel({ method: "oa_pdf", version: "publishedVersion", license: "cc-by-nc-nd" })).toBe(
      "Published version · CC BY-NC-ND"
    );
  });

  it("names a preprint, an uploaded PDF and a scraped page", () => {
    expect(fullTextSourceLabel({ method: "oa_pdf", version: "submittedVersion", host: "arxiv.org" })).toBe(
      "Preprint · arxiv.org"
    );
    expect(fullTextSourceLabel({ method: "uploaded_pdf" })).toBe("PDF you uploaded");
    expect(fullTextSourceLabel({ method: "landing_page", host: "elifesciences.org" })).toBe(
      "Publisher page · elifesciences.org"
    );
  });

  it("is undefined with nothing to say", () => {
    expect(fullTextSourceLabel(undefined)).toBeUndefined();
  });
});
```

Append to `apps/web/src/shared/utils/documentToSource.test.ts` (inside its top-level `describe`, matching the file's existing style):

```ts
  it("carries a paper's full-text source", () => {
    const source = documentToSource({
      _id: "d1",
      fileName: "A paper",
      fileType: "paper_record",
      status: "completed",
      createdAt: 0,
      ingestionStatus: "ingested",
      fulltextStatus: "available",
      fullTextSource: { method: "oa_pdf", version: "acceptedVersion" },
      paperRecord: { doi: "10.1/x" },
    });
    expect(source.paper?.fullTextSource).toEqual({ method: "oa_pdf", version: "acceptedVersion" });
  });
```

Append to `apps/web/src/features/sources/components/SourceListItem.test.tsx`, inside `describe("SourceListItem", …)`:

```ts
  const paper = (over: Partial<NonNullable<Source["paper"]>>): Partial<Source> => ({
    type: "PAPER",
    title: "A paper",
    paper: { ingestionStatus: "ingested", fulltextStatus: "available", ...over },
  });

  it("labels a paper with full text, with its version and licence as a tooltip", () => {
    setup(
      {},
      paper({ fullTextSource: { method: "oa_pdf", version: "acceptedVersion", license: "cc-by" } })
    );
    const hint = screen.getByText(/Full text/);
    expect(hint).toHaveAttribute("title", "Accepted manuscript · CC BY");
  });

  it("labels an abstract-only paper, whatever was guessed when it was added", () => {
    setup({}, paper({ ingestionStatus: "metadata_only", fulltextStatus: "external_only" }));
    expect(screen.getByText(/Abstract only/)).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run --cwd apps/web test src/features/sources/utils/fullTextSourceLabel.test.ts src/shared/utils/documentToSource.test.ts src/features/sources/components/SourceListItem.test.tsx`
Expected: FAIL — missing module, `fullTextSource` undefined, label text "Abstract"/"External".

- [ ] **Step 3: Add the type**

In `apps/web/src/shared/types/index.ts`, inside `paper?: { … }` after `ingestionStatus`:

```ts
    /** Where the full text came from; absent for abstract-only papers. */
    fullTextSource?: {
      method: "uploaded_pdf" | "oa_pdf" | "oa_html" | "landing_page";
      url?: string;
      version?: "publishedVersion" | "acceptedVersion" | "submittedVersion";
      license?: string;
      host?: string;
    };
```

- [ ] **Step 4: Map it in `documentToSource`**

In `apps/web/src/shared/utils/documentToSource.ts`, in the `paper_record` branch, add `fullTextSource: doc.fullTextSource,` to **both** objects of the `paper:` ternary, after `ingestionStatus: doc.ingestionStatus,`.

- [ ] **Step 5: Create the label helper**

`apps/web/src/features/sources/utils/fullTextSourceLabel.ts`:

```ts
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
```

- [ ] **Step 6: Update the labels in `SourceListItem`**

In `apps/web/src/features/sources/components/SourceListItem.tsx`, add the import:

```ts
import { fullTextSourceLabel } from "../utils/fullTextSourceLabel";
```

Replace `paperMetaHint` with:

```ts
  /** Short subtitle for papers — sentence case, no badge (see meta row below title). */
  const paperMetaHint = (): string | null => {
    if (source.type !== "PAPER" || !source.paper) return null;
    if (status === "processing" || source.paper.ingestionStatus === "pending") return null;
    if (status === "failed" || source.paper.ingestionStatus === "failed") return null;
    if (source.paper.ingestionStatus === "metadata_only") return "Abstract only";
    if (source.paper.ingestionStatus === "ingested") return "Full text";
    return null;
  };
```

and replace the hint `<span>`:

```tsx
                {paperHint && status === "completed" && (
                  <span
                    className="font-normal normal-case tracking-normal"
                    title={
                      paperHint === "Full text"
                        ? fullTextSourceLabel(source.paper?.fullTextSource)
                        : undefined
                    }
                  >
                    {" "}
                    · {paperHint}
                  </span>
                )}
```

- [ ] **Step 7: Run the tests**

Run: `bun run --cwd apps/web test src/features/sources src/shared/utils/documentToSource.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/shared/types/index.ts apps/web/src/shared/utils/documentToSource.ts apps/web/src/shared/utils/documentToSource.test.ts apps/web/src/features/sources/utils/fullTextSourceLabel.ts apps/web/src/features/sources/utils/fullTextSourceLabel.test.ts apps/web/src/features/sources/components/SourceListItem.tsx apps/web/src/features/sources/components/SourceListItem.test.tsx
git commit -m "feat(sources): label paper sources full text or abstract only (#480)" -- apps/web/src/shared/types/index.ts apps/web/src/shared/utils/documentToSource.ts apps/web/src/shared/utils/documentToSource.test.ts apps/web/src/features/sources/utils/fullTextSourceLabel.ts apps/web/src/features/sources/utils/fullTextSourceLabel.test.ts apps/web/src/features/sources/components/SourceListItem.tsx apps/web/src/features/sources/components/SourceListItem.test.tsx
```

---

### Task 11: Web actions — "Find full text" and "Upload PDF"

**Files:**
- Modify: `apps/web/src/features/sources/services/documentsApi.ts`, `apps/web/src/features/sources/components/SourceListItem.tsx`, `apps/web/src/features/sources/components/SourceList.tsx`, `apps/web/src/features/sources/components/SourcesPanel.tsx`
- Test: `apps/web/src/features/sources/components/SourceListItem.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append to `SourceListItem.test.tsx`:

```ts
  it("offers Find full text and Upload PDF for an abstract-only paper", async () => {
    const onFindFullText = vi.fn();
    const onUploadPdf = vi.fn();
    setup(
      { isMenuOpen: true, onFindFullText, onUploadPdf },
      paper({ ingestionStatus: "metadata_only" })
    );
    await userEvent.click(await screen.findByRole("menuitem", { name: "Find full text" }));
    expect(onFindFullText).toHaveBeenCalledWith("s1");
  });

  it("uploads a PDF from the menu", async () => {
    const onUploadPdf = vi.fn();
    setup(
      { isMenuOpen: true, onFindFullText: vi.fn(), onUploadPdf },
      paper({ ingestionStatus: "metadata_only" })
    );
    await userEvent.click(await screen.findByRole("menuitem", { name: "Upload PDF" }));
    expect(onUploadPdf).toHaveBeenCalledWith("s1");
  });

  it("doesn't offer them for a paper that has full text", async () => {
    setup({ isMenuOpen: true, onFindFullText: vi.fn(), onUploadPdf: vi.fn() }, paper({}));
    await screen.findByRole("menuitem", { name: "Rename" });
    expect(screen.queryByRole("menuitem", { name: "Find full text" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Upload PDF" })).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run --cwd apps/web test src/features/sources/components/SourceListItem.test.tsx`
Expected: FAIL — no "Find full text" menu item.

- [ ] **Step 3: Add the menu items**

In `SourceListItem.tsx`:
- add `FileUp` and `Search` to the `lucide-react` import;
- add to `SourceListItemProps`:

```ts
  /** Abstract-only papers: look for open-access full text again. */
  onFindFullText?: (id: string) => void;
  /** Abstract-only papers: attach a PDF the user has. */
  onUploadPdf?: (id: string) => void;
```

- destructure `onFindFullText,` and `onUploadPdf,` in the component's parameter list;
- after `const paperHint = paperMetaHint();` add:

```ts
  const isAbstractOnlyPaper = paperHint === "Abstract only" && status === "completed";
```

- in `<DropdownMenuContent>`, before the `{canRemoteRefresh && (` block, add:

```tsx
            {isAbstractOnlyPaper && onFindFullText && (
              <DropdownMenuItem onSelect={() => onFindFullText(source.id)}>
                <Search />
                Find full text
              </DropdownMenuItem>
            )}
            {isAbstractOnlyPaper && onUploadPdf && (
              <DropdownMenuItem onSelect={() => onUploadPdf(source.id)}>
                <FileUp />
                Upload PDF
              </DropdownMenuItem>
            )}
```

- [ ] **Step 4: Pass the callbacks through `SourceList`**

In `SourceList.tsx`, add to `SourceListProps` after `onRefreshSource`:

```ts
  onFindFullText: (id: string) => void;
  onUploadPdf: (id: string) => void;
```

destructure both after `onRefreshSource,`, and add to the `<SourceListItem … />` props after `onRefreshSource={onRefreshSource}`:

```tsx
              onFindFullText={onFindFullText}
              onUploadPdf={onUploadPdf}
```

In `SourceList.test.tsx`, add `onFindFullText={vi.fn()}` / `onFindFullText: vi.fn(),` and `onUploadPdf` the same way next to each existing `onRefreshSource` (lines ~32 and ~128) so the tests keep typechecking.

- [ ] **Step 5: Add the API hooks**

Append to `apps/web/src/features/sources/services/documentsApi.ts`:

```ts
/** Look for a paper source's open-access full text again. */
export function useFindPaperFullText() {
  const run = useMutation(api.documents.paperFullText.findFullText);
  return useCallback(
    (documentId: string) => run({ documentId: documentId as Id<"documents"> }),
    [run]
  );
}

/** Upload a PDF and attach it to a paper source; resolves to `{ ok }` or `{ ok: false, reason }`. */
export function useAttachPaperPdf() {
  const generateUploadUrl = useMutation(api.documents.index.generateUploadUrl);
  const attach = useMutation(api.documents.paperFullText.attachPdf);
  return useCallback(
    async (documentId: string, file: File) => {
      const uploadUrl = await generateUploadUrl();
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": "application/pdf" },
        body: file,
      });
      if (!res.ok) throw new Error("Upload failed");
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      return attach({ documentId: documentId as Id<"documents">, storageId });
    },
    [generateUploadUrl, attach]
  );
}
```

- [ ] **Step 6: Wire them in `SourcesPanel`**

In `SourcesPanel.tsx`:
- extend the `../services/documentsApi` import with `useAttachPaperPdf,` and `useFindPaperFullText,`;
- add `import { getServiceErrorMessage, parseServiceError } from "@/shared/utils/errorParser";`;
- after `const refreshRemoteSource = useRefreshRemoteSource();` add:

```ts
  const findPaperFullText = useFindPaperFullText();
  const attachPaperPdf = useAttachPaperPdf();
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const pdfTargetRef = useRef<string | null>(null);
```

- after `handleRefreshSource` add:

```ts
  const handleFindFullText = useCallback(
    async (sourceId: string) => {
      try {
        await findPaperFullText(sourceId);
        showInfo("Looking for the full text again.");
      } catch (err) {
        const parsed = parseServiceError(err);
        showError(parsed ? getServiceErrorMessage(parsed) : "Couldn't look for the full text. Try again.");
      }
    },
    [findPaperFullText, showInfo, showError]
  );

  const handleUploadPdf = useCallback((sourceId: string) => {
    pdfTargetRef.current = sourceId;
    pdfInputRef.current?.click();
  }, []);

  const handlePdfChosen = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      const documentId = pdfTargetRef.current;
      pdfTargetRef.current = null;
      if (!file || !documentId) return;
      if (file.type !== "application/pdf") return showError("Choose a PDF file.");
      if (file.size > 50 * 1024 * 1024) return showError("That PDF is over 50 MB.");
      try {
        const result = await attachPaperPdf(documentId, file);
        if (result.ok) showInfo("Reading the PDF you added.");
        else showError(result.reason);
      } catch (err) {
        const parsed = parseServiceError(err);
        showError(parsed ? getServiceErrorMessage(parsed) : "Couldn't add the PDF. Try again.");
      }
    },
    [attachPaperPdf, showInfo, showError]
  );
```

- pass to `<SourceList`, after `onRefreshSource={handleRefreshSource}`:

```tsx
              onFindFullText={handleFindFullText}
              onUploadPdf={handleUploadPdf}
```

- render the hidden input once, outside the viewer/list ternary, directly before the `<GoogleDrivePicker` element:

```tsx
      <input
        ref={pdfInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        aria-hidden
        tabIndex={-1}
        onChange={handlePdfChosen}
      />
```

- [ ] **Step 7: Run tests and typecheck**

Run: `bun run --cwd apps/web test src/features/sources`
Expected: PASS.

Run: `bun run typecheck:web`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/features/sources/services/documentsApi.ts apps/web/src/features/sources/components/SourceListItem.tsx apps/web/src/features/sources/components/SourceListItem.test.tsx apps/web/src/features/sources/components/SourceList.tsx apps/web/src/features/sources/components/SourceList.test.tsx apps/web/src/features/sources/components/SourcesPanel.tsx
git commit -m "feat(sources): Find full text and Upload PDF on abstract-only papers (#480)" -- apps/web/src/features/sources/services/documentsApi.ts apps/web/src/features/sources/components/SourceListItem.tsx apps/web/src/features/sources/components/SourceListItem.test.tsx apps/web/src/features/sources/components/SourceList.tsx apps/web/src/features/sources/components/SourceList.test.tsx apps/web/src/features/sources/components/SourcesPanel.tsx
```

---

### Task 12: "Abstract only" on citations

**Files:**
- Create: `apps/web/src/features/chat/utils/abstractOnlyReference.ts`
- Modify: `apps/web/src/features/chat/components/CitationCard.tsx`, `CitationPopover.tsx`, `ChatPanel.tsx`
- Test: `apps/web/src/features/chat/utils/abstractOnlyReference.test.ts`, `apps/web/src/features/chat/components/CitationCard.test.tsx`

- [ ] **Step 1: Write the failing tests**

`apps/web/src/features/chat/utils/abstractOnlyReference.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Source } from "@/shared/types";
import { isAbstractOnlyReference } from "./abstractOnlyReference";

const source = (id: string, ingestionStatus?: "ingested" | "metadata_only"): Source => ({
  id,
  title: id,
  type: "PAPER",
  date: "",
  selected: true,
  paper: ingestionStatus ? { ingestionStatus } : undefined,
});

describe("isAbstractOnlyReference", () => {
  const sources = [source("a", "metadata_only"), source("b", "ingested"), source("c")];

  it("is true only for a cited notebook paper that holds just its abstract", () => {
    expect(isAbstractOnlyReference({ documentId: "a" }, sources)).toBe(true);
    expect(isAbstractOnlyReference({ documentId: "b" }, sources)).toBe(false);
    expect(isAbstractOnlyReference({ documentId: "c" }, sources)).toBe(false);
    expect(isAbstractOnlyReference({ documentId: "zzz" }, sources)).toBe(false);
    expect(isAbstractOnlyReference({}, sources)).toBe(false);
  });
});
```

Append to `CitationCard.test.tsx`, inside its `describe`:

```ts
  test("marks a citation from an abstract-only paper", () => {
    render(<CitationCard refId={3} reference={reference()} abstractOnly />);
    expect(screen.getByText(/Reference 3 • Abstract only/)).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run --cwd apps/web test src/features/chat/utils/abstractOnlyReference.test.ts src/features/chat/components/CitationCard.test.tsx`
Expected: FAIL — missing module; no "Abstract only" text.

- [ ] **Step 3: Implement the helper**

`apps/web/src/features/chat/utils/abstractOnlyReference.ts`:

```ts
import type { ReferenceChunk, Source } from "@/shared/types/index";

/** True when the citation comes from a notebook paper that holds only its abstract (#480). */
export function isAbstractOnlyReference(
  reference: Pick<ReferenceChunk, "documentId">,
  sources: Source[]
): boolean {
  const id = reference.documentId?.trim();
  if (!id) return false;
  return sources.find((s) => s.id === id)?.paper?.ingestionStatus === "metadata_only";
}
```

- [ ] **Step 4: Show it on the card**

In `CitationCard.tsx`, add to `CitationCardProps`:

```ts
  /** The cited source is a paper that holds only its abstract. */
  abstractOnly?: boolean;
```

destructure `abstractOnly,` and change the header line to:

```tsx
            Reference {refId}
            {abstractOnly ? " • Abstract only" : ""}
            {pageNumber ? ` • p. ${pageNumber}` : ""}
            {sourceHost ? ` • ${sourceHost}` : ""}
```

- [ ] **Step 5: Thread it through the popover and chat panel**

In `CitationPopover.tsx`, add to `Options`:

```ts
  /** Whether this reference's source holds only its abstract. */
  isAbstractOnly?: (ref: ReferenceChunk) => boolean;
```

destructure `isAbstractOnly,` in `useCitationPopover({ … })`, and pass to `<CitationCard`:

```tsx
            abstractOnly={isAbstractOnly?.(reference) ?? false}
```

In `ChatPanel.tsx`, add `import { isAbstractOnlyReference } from "../utils/abstractOnlyReference";`, and before `const citation = useCitationPopover({` add:

```ts
  const isReferenceAbstractOnly = useCallback(
    (reference: ReferenceChunk) => isAbstractOnlyReference(reference, sources),
    [sources]
  );
```

then add `isAbstractOnly: isReferenceAbstractOnly,` to the `useCitationPopover({ … })` options.

- [ ] **Step 6: Run tests and typecheck**

Run: `bun run --cwd apps/web test src/features/chat`
Expected: PASS.

Run: `bun run typecheck:web`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/chat/utils/abstractOnlyReference.ts apps/web/src/features/chat/utils/abstractOnlyReference.test.ts apps/web/src/features/chat/components/CitationCard.tsx apps/web/src/features/chat/components/CitationCard.test.tsx apps/web/src/features/chat/components/CitationPopover.tsx apps/web/src/features/chat/components/ChatPanel.tsx
git commit -m "feat(chat): mark citations from abstract-only papers (#480)" -- apps/web/src/features/chat/utils/abstractOnlyReference.ts apps/web/src/features/chat/utils/abstractOnlyReference.test.ts apps/web/src/features/chat/components/CitationCard.tsx apps/web/src/features/chat/components/CitationCard.test.tsx apps/web/src/features/chat/components/CitationPopover.tsx apps/web/src/features/chat/components/ChatPanel.tsx
```

---

### Task 13: Backfill migration

**Files:**
- Create: `convex/_migration/backfillPaperFullText.ts`
- Test: `convex/_migration/backfillPaperFullText.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { hasNewCandidate, hasResolvableId, needsAbstractOnlyRelabel } from "./backfillPaperFullText";

const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");

describe("needsAbstractOnlyRelabel", () => {
  const paper = {
    fileType: "paper_record",
    ingestionStatus: "ingested" as const,
    paperRecord: { abstract: "An abstract.", authors: [], isOa: false },
  };

  it("relabels an 'ingested' paper whose stored text is abstract-sized", () => {
    expect(needsAbstractOnlyRelabel({ ...paper, extractedMarkdown: "# T\n\n## Abstract\nAn abstract." })).toBe(true);
  });

  it("keeps a paper whose stored text is full-text length", () => {
    expect(needsAbstractOnlyRelabel({ ...paper, extractedMarkdown: words(2_000) })).toBe(false);
  });

  it("keeps papers ingested by the new pipeline, other statuses, and other source types", () => {
    expect(needsAbstractOnlyRelabel({ ...paper, extractedMarkdown: "short", fullTextSource: { method: "oa_pdf" } })).toBe(false);
    expect(needsAbstractOnlyRelabel({ ...paper, ingestionStatus: "metadata_only", extractedMarkdown: "short" })).toBe(false);
    expect(needsAbstractOnlyRelabel({ ...paper, fileType: "url", extractedMarkdown: "short" })).toBe(false);
  });
});

describe("hasResolvableId", () => {
  it("needs a DOI or an OpenAlex id", () => {
    expect(hasResolvableId({ doi: "10.1/x" })).toBe(true);
    expect(hasResolvableId({ openAlexId: "W1" })).toBe(true);
    expect(hasResolvableId({ doi: " " })).toBe(false);
    expect(hasResolvableId(undefined)).toBe(false);
  });
});

describe("hasNewCandidate", () => {
  it("ignores the PDF link the first import already tried", () => {
    const tried = "https://journal.example/a.pdf";
    expect(hasNewCandidate([{ url: "http://journal.example/a.pdf/" }], tried)).toBe(false);
    expect(hasNewCandidate([{ url: tried }, { url: "https://arxiv.org/pdf/1" }], tried)).toBe(true);
    expect(hasNewCandidate([], undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun run test:convex convex/_migration/backfillPaperFullText.test.ts`
Expected: FAIL — cannot resolve `./backfillPaperFullText`.

- [ ] **Step 3: Implement**

```ts
/**
 * Migration (#480): fix the labels on paper sources stored before open-access resolution, then
 * look for full text again for those that only hold an abstract.
 *
 * Before #480 every paper was marked `ingested`, even when only its abstract stub (or a paywall page)
 * was stored. Relabel: an `ingested` paper with no `fullTextSource` whose stored text fails the
 * full-text test becomes `metadata_only`. No external calls. Re-resolve (opt in): for each completed
 * abstract-only paper with a DOI or OpenAlex id, run the resolver; if it finds a copy other than the
 * PDF link the first import already tried, re-ingest. Re-resolves are spaced 10 s apart.
 *
 *   npx convex run _migration/backfillPaperFullText:start '{"dryRun": true, "reResolve": true}'
 *   npx convex run _migration/backfillPaperFullText:start '{"dryRun": false}'
 *   npx convex run _migration/backfillPaperFullText:start '{"dryRun": false, "reResolve": true}'
 *
 * Counts are logged as one JSON line when the scan ends. Safe to rerun.
 */

import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { internalAction, internalMutation } from "../_generated/server";
import { isFullTextLength } from "../_services/extraction/openAccess/fullTextTest";
import {
  candidateKey,
  resolveOpenAccessCandidates,
} from "../_services/extraction/openAccess/OpenAccessResolver";

/** Stored markdown can be ~800 KB per document; 4 per batch stays well under the read limit. */
const BATCH_SIZE = 4;
const RE_RESOLVE_SPACING_MS = 10_000;

const countsValidator = v.object({
  scanned: v.number(),
  relabeled: v.number(),
  queued: v.number(),
});

export function needsAbstractOnlyRelabel(
  doc: Pick<Doc<"documents">, "fileType" | "ingestionStatus" | "fullTextSource" | "extractedMarkdown" | "paperRecord">
): boolean {
  return (
    doc.fileType === "paper_record" &&
    doc.ingestionStatus === "ingested" &&
    !doc.fullTextSource &&
    !isFullTextLength(doc.extractedMarkdown ?? "", doc.paperRecord?.abstract)
  );
}

export function hasResolvableId(pr: { doi?: string; openAlexId?: string } | undefined): boolean {
  return Boolean(pr?.doi?.trim() || pr?.openAlexId?.trim());
}

export function hasNewCandidate(candidates: Array<{ url: string }>, triedPdfUrl: string | undefined): boolean {
  const tried = triedPdfUrl ? candidateKey(triedPdfUrl) : undefined;
  return candidates.some((c) => candidateKey(c.url) !== tried);
}

export const start = internalMutation({
  args: { dryRun: v.boolean(), reResolve: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    await ctx.scheduler.runAfter(0, internal._migration.backfillPaperFullText.scan, {
      cursor: null,
      dryRun: args.dryRun,
      reResolve: args.reResolve ?? false,
      counts: { scanned: 0, relabeled: 0, queued: 0 },
    });
  },
});

export const scan = internalMutation({
  args: {
    cursor: v.union(v.string(), v.null()),
    dryRun: v.boolean(),
    reResolve: v.boolean(),
    counts: countsValidator,
  },
  handler: async (ctx, args) => {
    const result = await ctx.db.query("documents").paginate({ cursor: args.cursor, numItems: BATCH_SIZE });
    const counts = { ...args.counts };

    for (const doc of result.page) {
      if (doc.fileType !== "paper_record") continue;
      counts.scanned++;
      let abstractOnly = doc.ingestionStatus === "metadata_only";

      if (needsAbstractOnlyRelabel(doc)) {
        counts.relabeled++;
        abstractOnly = true;
        if (!args.dryRun) {
          await ctx.db.patch(doc._id, {
            ingestionStatus: "metadata_only",
            fulltextStatus: doc.fulltextStatus === "external_only" ? "external_only" : "unavailable",
            updatedAt: Date.now(),
          });
        }
      }

      if (args.reResolve && abstractOnly && doc.status === "completed" && hasResolvableId(doc.paperRecord)) {
        if (!args.dryRun) {
          await ctx.scheduler.runAfter(
            counts.queued * RE_RESOLVE_SPACING_MS,
            internal._migration.backfillPaperFullText.reResolve,
            { documentId: doc._id }
          );
        }
        counts.queued++;
      }
    }

    if (result.isDone) {
      console.log(JSON.stringify({ migration: "backfillPaperFullText", dryRun: args.dryRun, reResolve: args.reResolve, ...counts }));
      return;
    }
    await ctx.scheduler.runAfter(0, internal._migration.backfillPaperFullText.scan, {
      cursor: result.continueCursor,
      dryRun: args.dryRun,
      reResolve: args.reResolve,
      counts,
    });
  },
});

/** Re-ingests one abstract-only paper when the resolver finds a copy the first import didn't try. */
export const reResolve = internalAction({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const doc = await ctx.runQuery(internal.documents.internal.getDocumentDetails, {
      documentId: args.documentId,
    });
    const pr = doc.paperRecord;
    if (doc.ingestionStatus !== "metadata_only" || !pr) return;

    const candidates = await resolveOpenAccessCandidates({ doi: pr.doi, openAlexId: pr.openAlexId });
    const reingest = hasNewCandidate(candidates, pr.pdfUrl);
    console.log(
      JSON.stringify({ migration: "backfillPaperFullText.reResolve", documentId: args.documentId, candidates: candidates.length, reingest })
    );
    if (reingest) {
      await ctx.runMutation(internal.documents.internal.prepareDocumentReembed, {
        documentId: args.documentId,
        delayMs: 0,
      });
    }
  },
});
```

Note: `getDocumentDetails` throws "Document not found" for a document deleted since the scan; that failure only affects the one scheduled action and is acceptable.

- [ ] **Step 4: Regenerate and run the tests**

Run: `npx convex codegen`
Expected: completes.

Run: `bun run test:convex convex/_migration/backfillPaperFullText.test.ts`
Expected: PASS (7 tests).

Run: `bun run typecheck:convex`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add convex/_migration/backfillPaperFullText.ts convex/_migration/backfillPaperFullText.test.ts convex/_generated
git commit -m "chore(sources): migration to relabel and re-resolve abstract-only papers (#480)" -- convex/_migration/backfillPaperFullText.ts convex/_migration/backfillPaperFullText.test.ts convex/_generated
```

---

### Task 14: Coverage measurement

**Files:**
- Create: `convex/eval/openAccessCoverage.ts`

No unit test: it's a measurement harness over live APIs; its logic is the already-tested resolver, fetcher and full-text test.

- [ ] **Step 1: Implement**

```ts
"use node";
/**
 * Measures #480: on a seeded sample of article DOIs from OpenAlex, how often the old path got a
 * PDF (the provider's single OA link downloads as a real PDF) versus the new resolver (any
 * candidate yields a real PDF or a full-text-length HTML page). No OCR, to keep the cost down.
 *
 * Runs in batches to stay inside the 600 s action limit; the sample is the same for every batch.
 *
 *   npx convex run eval/openAccessCoverage:run '{"offset": 0, "limit": 25}'
 *   … offset 25, 50, … 175, then add the batch counts.
 */

import { v } from "convex/values";
import { allWithConcurrency } from "../_agents/_shared/concurrency";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { env } from "../_lib/env";
import { fetchOaCandidate } from "../_services/extraction/openAccess/fetchOaCandidate";
import { isFullTextLength } from "../_services/extraction/openAccess/fullTextTest";
import {
  openAccessUserAgent,
  resolveOpenAccessCandidates,
} from "../_services/extraction/openAccess/OpenAccessResolver";
import { MAX_CANDIDATE_ATTEMPTS } from "../documents/paperIngest";

const SAMPLE_SIZE = 200;

type SampledWork = { doi?: string | null; open_access?: { oa_url?: string | null } };

async function sampleWorks(seed: number): Promise<SampledWork[]> {
  const mailto = encodeURIComponent(env.OPEN_ACCESS_CONTACT_EMAIL);
  const url =
    `https://api.openalex.org/works?sample=${SAMPLE_SIZE}&seed=${seed}&per-page=${SAMPLE_SIZE}` +
    `&filter=has_doi:true,type:article&select=doi,open_access&mailto=${mailto}`;
  const res = await fetch(url, { headers: { "User-Agent": openAccessUserAgent() } });
  if (!res.ok) throw new Error(`OpenAlex sample failed: HTTP ${res.status}`);
  return ((await res.json()) as { results: SampledWork[] }).results;
}

export const run = internalAction({
  args: {
    offset: v.optional(v.number()),
    limit: v.optional(v.number()),
    seed: v.optional(v.number()),
    scrapeHtml: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const offset = args.offset ?? 0;
    const limit = args.limit ?? 25;
    const scrapeHtml = args.scrapeHtml ?? true;
    const works = (await sampleWorks(args.seed ?? 480)).slice(offset, offset + limit);

    const results = await allWithConcurrency(
      works.map((work) => async () => {
        const oaUrl = work.open_access?.oa_url;
        const before = oaUrl ? (await fetchOaCandidate(oaUrl)).type === "pdf" : false;

        let after: "oa_pdf" | "oa_html" | null = null;
        const candidates = await resolveOpenAccessCandidates({ doi: work.doi ?? undefined });
        for (const candidate of candidates.slice(0, MAX_CANDIDATE_ATTEMPTS)) {
          const fetched = await fetchOaCandidate(candidate.url);
          if (fetched.type === "pdf") {
            after = "oa_pdf";
            break;
          }
          if (fetched.type === "html" && scrapeHtml) {
            try {
              const page = await ctx.runAction(internal._services.extractors.scrapeWebPageInternal, {
                url: fetched.finalUrl,
              });
              if (isFullTextLength(page.content, "")) {
                after = "oa_html";
                break;
              }
            } catch {
              // A failed scrape is a miss; try the next candidate.
            }
          }
        }
        return { before, after, candidates: candidates.length };
      }),
      5
    );

    const summary = {
      offset,
      total: results.length,
      before: results.filter((r) => r.before).length,
      after: results.filter((r) => r.after).length,
      afterPdf: results.filter((r) => r.after === "oa_pdf").length,
      afterHtml: results.filter((r) => r.after === "oa_html").length,
      withAnyCandidate: results.filter((r) => r.candidates > 0).length,
    };
    console.log(JSON.stringify({ eval: "openAccessCoverage", ...summary }));
    return summary;
  },
});
```

- [ ] **Step 2: Regenerate and typecheck**

Run: `npx convex codegen`
Expected: completes.

Run: `bun run typecheck:convex`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add convex/eval/openAccessCoverage.ts convex/_generated
git commit -m "chore(evals): measure open-access full-text coverage before and after (#480)" -- convex/eval/openAccessCoverage.ts convex/_generated
```

---

### Task 15: Verification on dev

The dev deployment is shared with other sessions: `npx convex dev --once` deploys this branch's functions over whatever is there. Tell the user before running it, and run it once per verification round.

- [ ] **Step 1: Full local gates**

Run each, separately:

```bash
bun run typecheck:web
bun run typecheck:convex
bun run lint
bun run lint:design
bun run test:convex
bun run test:web
bun run knip
```

Expected: all pass. Knip: `convex/eval/openAccessCoverage.ts`, `convex/documents/paperFullText.ts` and `convex/_migration/backfillPaperFullText.ts` are entries; `openAccess/*` and `paperIngest.ts` are reached from them.

- [ ] **Step 2: Deploy to dev and set the contact email**

```bash
npx convex env set OPEN_ACCESS_CONTACT_EMAIL support@solomindlm.com
npx convex dev --once
```

- [ ] **Step 3: Measure coverage**

Run the eight batches (`offset` 0, 25, … 175, `limit` 25) with `npx convex run eval/openAccessCoverage:run '{"offset": N, "limit": 25}'` and add up `before`, `after`, `afterPdf`, `afterHtml`, `total`. Record before % and after % for the PR description.

- [ ] **Step 4: End-to-end in the app**

Start the web dev server (`preview_start` in the desktop app, or `bun run dev:web`). In a test notebook:
1. Add `10.1038/nature12373` from the DOI form. Expect "Full text" after processing, with a tooltip naming the version.
2. Add a paywalled DOI with no open-access copy (pick one whose Unpaywall record has `is_oa: false`). Expect "Abstract only"; the `⋯` menu shows "Find full text" and "Upload PDF".
3. Use "Upload PDF" with any small PDF. Expect "Processing", then "Full text" with the tooltip "PDF you uploaded".
4. Ask a chat question that cites the abstract-only paper. Expect "Abstract only" in the citation card header.

Check the Convex logs for `open_access` lines and no errors.

- [ ] **Step 5: Backfill dry run on dev**

```bash
npx convex run _migration/backfillPaperFullText:start '{"dryRun": true, "reResolve": true}'
```

Expected: one `backfillPaperFullText` JSON log line with `scanned`, `relabeled`, `queued`. Then run for real on dev (`"dryRun": false`, then with `"reResolve": true`) and spot-check a relabeled paper in the UI. Production runs happen after the PR is merged and deployed, with the user's go-ahead.

- [ ] **Step 6: Open the PR**

Use superpowers:finishing-a-development-branch. PR title: `feat(sources): find open-access full text before falling back to the abstract (#480)`. Include the coverage numbers, the backfill dry-run counts, the spec deviation (menu-only actions), and `Closes #480`.
