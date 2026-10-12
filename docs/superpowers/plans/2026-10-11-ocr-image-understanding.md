# OCR Image Understanding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Describe images and figures in text during OCR, so standalone image uploads and figures inside PDFs, PPTX and DOCX reach retrieval, and fail visibly when a file has nothing readable.

**Architecture:** All changes sit in `convex/_services/extraction/MistralOCRService.ts`, behind its existing `processDocument(url)` interface. The OCR request adds Mistral's `bbox_annotation_format`; the response stitcher replaces each `![img-N](img-N)` placeholder with a blockquote description, next to the existing table inlining. An annotated request that is rejected (4xx, not 429) or times out falls back once to today's plain request. `embeddingJob` passes an `image`/`document` hint because Convex storage URLs carry no extension.

**Tech Stack:** Convex actions (`"use node"`), Mistral OCR REST API (`mistral-ocr-latest`), Vitest (`bun run test:convex`), Bun.

**Spec:** [`docs/superpowers/specs/2026-10-11-ocr-image-understanding-design.md`](../specs/2026-10-11-ocr-image-understanding-design.md)

---

## File map

| File | Change |
| --- | --- |
| `convex/_services/extraction/MistralOCRService.ts` | Figure annotation parsing and inlining, document annotation, `hasOcrContent`, request builder, input-kind helper, annotated → plain fallback, empty-result error |
| `convex/_services/extraction/MistralOCRService.test.ts` | Unit tests for all of the above, plus `processDocument` with a stubbed `fetch` |
| `convex/documents/embeddingJob.ts` | Build `OCR_FILE_EXTENSIONS` from the shared image list; pass the input kind to `processDocument` |

`urlSource.ts` and `AcademicLoaderService.ts` are not changed: both already handle an OCR call that throws.

---

### Task 0: Probe the real API (scratch only, nothing committed) — DONE 2026-10-12

Findings are in the spec, section 4. Outcome: annotations come back as `image_annotation` JSON strings, the `enum`
schema is accepted, placeholders always match, latency is low. `document_annotation_format` was dropped from the
design (it describes the OCR text, not the picture); standalone photo description moved to a follow-up PR.

The parser accepts the annotation under `image_annotation` or `bbox_annotation`, as a string or object, but we need to know what OCR 4.1 actually returns, whether the strict schema with an `enum` is accepted, and what a photo yields.

**Files:**
- Create (scratchpad, not the repo): `<scratchpad>/ocr-probe/probe.ts`
- Inputs (scratchpad): `<scratchpad>/ocr-probe/inputs/` — your own sample files, one per category: text screenshot, chart, diagram, handwritten page, photo (no text), plus one PDF with several figures.

- [ ] **Step 1: Collect inputs**

Put six sample files in `<scratchpad>/ocr-probe/inputs/` covering the categories above. Public URLs work too (the Mistral docs use `https://arxiv.org/pdf/2410.07073` for a figure-heavy PDF and `https://raw.githubusercontent.com/mistralai/cookbook/refs/heads/main/mistral/ocr/receipt.png` for a text image).

- [ ] **Step 2: Write the probe**

```ts
// <scratchpad>/ocr-probe/probe.ts
// Usage (from the worktree root, so Bun loads .env.local): bun <path>/probe.ts <file-or-url> [...]
import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";

const IMAGE_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".avif": "image/avif",
};

const FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "figure_annotation",
    strict: true,
    schema: {
      title: "FigureAnnotation",
      type: "object",
      additionalProperties: false,
      required: ["kind", "description", "details"],
      properties: {
        kind: {
          type: "string",
          enum: ["chart", "diagram", "table", "photo", "screenshot", "equation", "logo", "other"],
          description: "What the image is.",
        },
        description: { type: "string", description: "What the image shows, in one or two plain sentences." },
        details: {
          type: "string",
          description:
            "Text, labels, axis titles, values and trends visible in the image that a reader would need to answer questions about it. Empty for decorative images.",
        },
      },
    },
  },
};

function documentFor(input: string): { kind: "image" | "document"; document: Record<string, string> } {
  const ext = extname(input.split("?")[0]).toLowerCase();
  const isImage = ext in IMAGE_MIME;
  if (/^https?:\/\//.test(input)) {
    return isImage
      ? { kind: "image", document: { type: "image_url", image_url: input } }
      : { kind: "document", document: { type: "document_url", document_url: input } };
  }
  const b64 = readFileSync(input).toString("base64");
  return isImage
    ? { kind: "image", document: { type: "image_url", image_url: `data:${IMAGE_MIME[ext]};base64,${b64}` } }
    : { kind: "document", document: { type: "document_url", document_url: `data:application/pdf;base64,${b64}` } };
}

const outDir = join(dirname(process.argv[1]), "out");
for (const input of process.argv.slice(2)) {
  const { kind, document } = documentFor(input);
  const body: Record<string, unknown> = {
    model: "mistral-ocr-latest",
    document,
    table_format: "markdown",
    include_image_base64: false,
    bbox_annotation_format: FORMAT,
  };
  if (kind === "image") body.document_annotation_format = FORMAT;

  const t0 = Date.now();
  const res = await fetch("https://api.mistral.ai/v1/ocr", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const ms = Date.now() - t0;
  const data = await res.json();
  writeFileSync(join(outDir, `${basename(input).replace(/[^\w.-]/g, "_")}.json`), JSON.stringify(data, null, 2));

  console.log(`\n=== ${input} (${kind}) → HTTP ${res.status} in ${ms}ms`);
  if (!res.ok) {
    console.log(JSON.stringify(data).slice(0, 600));
    continue;
  }
  console.log("document_annotation:", typeof data.document_annotation, JSON.stringify(data.document_annotation)?.slice(0, 300));
  for (const page of data.pages ?? []) {
    console.log(`-- page ${page.index}: ${(page.markdown ?? "").length} chars; markdown head: ${JSON.stringify((page.markdown ?? "").slice(0, 160))}`);
    for (const img of page.images ?? []) {
      const keys = Object.keys(img).filter((k) => k.includes("annotation"));
      const placeholderFound = (page.markdown ?? "").includes(`](${img.id})`);
      console.log(`   image ${img.id}: annotation keys=${keys.join(",")} placeholderInMarkdown=${placeholderFound}`);
      for (const k of keys) console.log(`     ${k} (${typeof img[k]}): ${JSON.stringify(img[k]).slice(0, 300)}`);
    }
  }
}
```

- [ ] **Step 3: Run it**

```bash
mkdir -p "<scratchpad>/ocr-probe/out" && bun "<scratchpad>/ocr-probe/probe.ts" <scratchpad>/ocr-probe/inputs/*
```

Run from the worktree root so Bun loads `MISTRAL_API_KEY` from `.env.local`. Do not print the key.

- [ ] **Step 4: Record findings and decide**

Write down, per input: HTTP status, latency, annotation field name and `typeof`, whether placeholders match image ids, and what the photo returned.

Decision rules:
- **Any 4xx on the annotated request** (for example the `enum` is rejected): change `kind` in the schema to `{ type: "string", description: "What the image is: chart, diagram, table, photo, screenshot, equation, logo or other." }`, re-run, and use that schema in Task 4. Without this, production would silently fall back to plain OCR on every call.
- **Photo returns neither text nor a usable `document_annotation`**: stop and tell the user. The spec's approach C (one vision-chat call for standalone images) has to be designed before continuing.
- **Annotated latency for the multi-figure PDF above ~120s**: tell the user before choosing a timeout above 180s.
- Field names other than `image_annotation` / `bbox_annotation`, or a `document_annotation` that is neither string nor object: adjust `inlineOcrFigures` / `parseFigureAnnotation` in Tasks 1–2 to read them.

Report the findings to the user before Task 1.

---

### Task 1: Parse figure annotations and inline them per page

**Files:**
- Modify: `convex/_services/extraction/MistralOCRService.ts` (after `inlineOcrTables`, around line 26)
- Test: `convex/_services/extraction/MistralOCRService.test.ts`

- [ ] **Step 1: Write the failing tests**

Replace the import line at the top of `MistralOCRService.test.ts` and add the new `describe` blocks at the end of the file:

```ts
import { describe, expect, it, vi } from "vitest";
import {
  figureBlock,
  inlineOcrFigures,
  markdownFromMistralOcrResponse,
  parseFigureAnnotation,
} from "./MistralOCRService";
```

```ts
const CHART = { kind: "chart", description: "Revenue by region.", details: "EMEA rises from 1.2M to 2.0M." };

describe("parseFigureAnnotation", () => {
  it("reads an annotation given as a JSON string", () => {
    expect(parseFigureAnnotation(JSON.stringify(CHART))).toEqual({ status: "ok", annotation: CHART });
  });

  it("reads an annotation given as an object", () => {
    expect(parseFigureAnnotation(CHART)).toEqual({ status: "ok", annotation: CHART });
  });

  it("collapses whitespace so the description stays on one blockquote line", () => {
    const parsed = parseFigureAnnotation({ kind: "diagram", description: "A\n  flow\tchart.", details: " x \n y " });
    expect(parsed).toEqual({ status: "ok", annotation: { kind: "diagram", description: "A flow chart.", details: "x y" } });
  });

  it("skips absent, empty and logo annotations", () => {
    expect(parseFigureAnnotation(undefined)).toEqual({ status: "skip" });
    expect(parseFigureAnnotation("")).toEqual({ status: "skip" });
    expect(parseFigureAnnotation({ ...CHART, description: "  " })).toEqual({ status: "skip" });
    expect(parseFigureAnnotation({ ...CHART, kind: "logo" })).toEqual({ status: "skip" });
  });

  it("flags unparseable or wrongly shaped annotations as malformed", () => {
    expect(parseFigureAnnotation("{not json")).toEqual({ status: "malformed" });
    expect(parseFigureAnnotation(42)).toEqual({ status: "malformed" });
    expect(parseFigureAnnotation({ kind: "chart" })).toEqual({ status: "malformed" });
  });

  it("defaults a missing kind to other and missing details to empty", () => {
    expect(parseFigureAnnotation({ description: "A map." })).toEqual({
      status: "ok",
      annotation: { kind: "other", description: "A map.", details: "" },
    });
  });
});

describe("figureBlock", () => {
  it("renders a description and details as a blockquote", () => {
    expect(figureBlock(CHART)).toBe(
      "> **Figure (chart):** Revenue by region.\n> Details: EMEA rises from 1.2M to 2.0M."
    );
  });

  it("omits the details line when details are empty", () => {
    expect(figureBlock({ ...CHART, details: "" })).toBe("> **Figure (chart):** Revenue by region.");
  });
});

describe("inlineOcrFigures", () => {
  const BLOCK = figureBlock(CHART);

  it("replaces the placeholder in place, under either annotation field name", () => {
    for (const field of ["image_annotation", "bbox_annotation"]) {
      const md = inlineOcrFigures("Intro\n\n![img-0.jpeg](img-0.jpeg)\n\nOutro", [
        { id: "img-0.jpeg", [field]: JSON.stringify(CHART) },
      ]);
      expect(md).toBe(`Intro\n\n${BLOCK}\n\nOutro`);
    }
  });

  it("leaves the placeholder for the media stripper when the figure is skipped", () => {
    const md = inlineOcrFigures("![img-0.jpeg](img-0.jpeg)", [
      { id: "img-0.jpeg", image_annotation: { ...CHART, kind: "logo" } },
    ]);
    expect(md).toBe("![img-0.jpeg](img-0.jpeg)");
  });

  it("reports malformed annotations by image id", () => {
    const onMalformed = vi.fn();
    inlineOcrFigures("![img-0.jpeg](img-0.jpeg)", [{ id: "img-0.jpeg", image_annotation: "{bad" }], onMalformed);
    expect(onMalformed).toHaveBeenCalledWith("img-0.jpeg");
  });

  it("appends a figure whose placeholder is missing at the end of the page", () => {
    const md = inlineOcrFigures("text", [{ id: "img-3.jpeg", image_annotation: CHART }]);
    expect(md).toBe(`text\n\n${BLOCK}`);
  });

  it("keeps dollar signs in descriptions literal", () => {
    const md = inlineOcrFigures("![a](a)", [
      { id: "a", image_annotation: { kind: "chart", description: "Price $& and $$.", details: "" } },
    ]);
    expect(md).toBe("> **Figure (chart):** Price $& and $$.");
  });

  it("matches ids with regex characters literally", () => {
    const md = inlineOcrFigures("![x](img-(1).png)", [{ id: "img-(1).png", image_annotation: CHART }]);
    expect(md).toBe(BLOCK);
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `bun run test:convex -- convex/_services/extraction/MistralOCRService.test.ts`
Expected: FAIL, `parseFigureAnnotation` / `figureBlock` / `inlineOcrFigures` are not exported.

- [ ] **Step 3: Implement**

In `MistralOCRService.ts`, replace the `MistralOcrTable` type line with these types, and add the functions after `inlineOcrTables`:

```ts
type MistralOcrTable = { id?: string; content?: string; format?: string };

/** OCR returns a figure's annotation under one of these names, as a JSON string or an object. */
type MistralOcrImage = { id?: string; image_annotation?: unknown; bbox_annotation?: unknown };

export interface FigureAnnotation {
  kind: string;
  description: string;
  details: string;
}

type ParsedFigureAnnotation =
  | { status: "ok"; annotation: FigureAnnotation }
  | { status: "skip" }
  | { status: "malformed" };

const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

/**
 * A figure annotation worth keeping. Absent, empty and logo annotations are skipped (decoration);
 * an annotation that isn't JSON or lacks a description is malformed.
 */
export function parseFigureAnnotation(raw: unknown): ParsedFigureAnnotation {
  if (raw === undefined || raw === null || raw === "") return { status: "skip" };
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return { status: "malformed" };
    }
  }
  if (typeof value !== "object" || value === null) return { status: "malformed" };
  const { kind, description, details } = value as Record<string, unknown>;
  if (typeof description !== "string") return { status: "malformed" };
  const text = oneLine(description);
  if (!text || kind === "logo") return { status: "skip" };
  return {
    status: "ok",
    annotation: {
      kind: typeof kind === "string" && kind.trim() ? oneLine(kind) : "other",
      description: text,
      details: typeof details === "string" ? oneLine(details) : "",
    },
  };
}

/** A figure description as a blockquote, so chunks and the source viewer show it as quoted figure text. */
export function figureBlock(annotation: FigureAnnotation): string {
  const head = `> **Figure (${annotation.kind}):** ${annotation.description}`;
  return annotation.details ? `${head}\n> Details: ${annotation.details}` : head;
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * OCR leaves `![img-0.jpeg](img-0.jpeg)` where each figure was. Put the figure's description there;
 * a described figure without a placeholder goes at the page end. Skipped figures keep their
 * placeholder, which `stripMistralOcrMedia` removes.
 */
export function inlineOcrFigures(
  markdown: string,
  images: MistralOcrImage[] | undefined,
  onMalformed?: (imageId: string) => void
): string {
  let md = markdown;
  for (const image of images ?? []) {
    if (!image.id) continue;
    const parsed = parseFigureAnnotation(image.image_annotation ?? image.bbox_annotation);
    if (parsed.status === "malformed") onMalformed?.(image.id);
    if (parsed.status !== "ok") continue;
    const block = figureBlock(parsed.annotation);
    const placeholder = new RegExp(`!\\[[^\\]]*\\]\\(${escapeRegExp(image.id)}\\)`);
    // Function replacer: descriptions can contain "$", which a string replacement would interpret.
    md = placeholder.test(md) ? md.replace(placeholder, () => block) : `${md.trimEnd()}\n\n${block}`;
  }
  return md;
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `bun run test:convex -- convex/_services/extraction/MistralOCRService.test.ts`
Expected: PASS (all old and new tests).

- [ ] **Step 5: Commit**

```bash
git add -- convex/_services/extraction/MistralOCRService.ts convex/_services/extraction/MistralOCRService.test.ts
git commit -m "feat(ocr): parse figure annotations and inline them as descriptions" -- convex/_services/extraction/MistralOCRService.ts convex/_services/extraction/MistralOCRService.test.ts
```

---

### Task 2: Wire figure descriptions into page stitching

**Files:**
- Modify: `convex/_services/extraction/MistralOCRService.ts` (`markdownFromMistralOcrResponse`)
- Test: `convex/_services/extraction/MistralOCRService.test.ts`

- [ ] **Step 1: Write the failing tests**

Add inside the existing `describe("markdownFromMistralOcrResponse", …)` block:

```ts
  it("inlines figure descriptions on their page", () => {
    const md = markdownFromMistralOcrResponse({
      pages: [
        { markdown: "one" },
        { markdown: "![img-0.jpeg](img-0.jpeg)", images: [{ id: "img-0.jpeg", image_annotation: JSON.stringify(CHART) }] },
      ],
    });
    expect(md).toBe(`**Page 1**\n\none\n\n---\n\n**Page 2**\n\n${figureBlock(CHART)}`);
  });

  it("reports malformed figure annotations through the option", () => {
    const onMalformedAnnotation = vi.fn();
    markdownFromMistralOcrResponse(
      { pages: [{ markdown: "![img-0.jpeg](img-0.jpeg)", images: [{ id: "img-0.jpeg", image_annotation: "{bad" }] }] },
      { onMalformedAnnotation }
    );
    expect(onMalformedAnnotation).toHaveBeenCalledWith("img-0.jpeg");
  });
```

`CHART` is declared at module level in Task 1; move its declaration up next to `TABLE` so every `describe` block reads it from the top of the file.

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `bun run test:convex -- convex/_services/extraction/MistralOCRService.test.ts`
Expected: FAIL. Figures stay as placeholders.

- [ ] **Step 3: Implement**

Replace `markdownFromMistralOcrResponse` with:

```ts
export type MistralOcrResponse = {
  pages?: Array<{ markdown?: string; tables?: MistralOcrTable[]; images?: MistralOcrImage[] }>;
  markdown?: string;
  text?: string;
};

/**
 * Stitch OCR pages into one markdown string with visible page labels (HTML comments are hidden when rendered).
 * Tables and figure descriptions are put back where OCR left their placeholders.
 */
export function markdownFromMistralOcrResponse(
  data: MistralOcrResponse,
  options: { onMalformedAnnotation?: (imageId: string) => void } = {}
): string {
  if (data?.pages && Array.isArray(data.pages) && data.pages.length > 0) {
    return data.pages
      .map((page, index) => {
        const withTables = inlineOcrTables(page.markdown || "", page.tables);
        const md = inlineOcrFigures(withTables, page.images, options.onMalformedAnnotation);
        const label = `**Page ${index + 1}**`;
        return index === 0 ? `${label}\n\n${md}` : `---\n\n${label}\n\n${md}`;
      })
      .join("\n\n");
  }
  return data.markdown || data.text || "";
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `bun run test:convex -- convex/_services/extraction/MistralOCRService.test.ts`
Expected: PASS. The existing "labels and joins pages" test must still produce `**Page 1**\n\none\n\n---\n\n**Page 2**\n\ntwo`.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(ocr): stitch figure descriptions into OCR pages" -- convex/_services/extraction/MistralOCRService.ts convex/_services/extraction/MistralOCRService.test.ts
```

---

### Task 3: Detect an OCR result with nothing readable

**Files:**
- Modify: `convex/_services/extraction/MistralOCRService.ts`
- Test: `convex/_services/extraction/MistralOCRService.test.ts`

- [ ] **Step 1: Write the failing tests**

Add `hasOcrContent` to the import list, then:

```ts
describe("hasOcrContent", () => {
  it("is false for page labels, separators and whitespace only", () => {
    expect(hasOcrContent("")).toBe(false);
    expect(hasOcrContent("**Page 1**")).toBe(false);
    expect(hasOcrContent("**Page 1**\n\n   \n\n---\n\n**Page 2**\n\n")).toBe(false);
  });

  it("is true when a page has text", () => {
    expect(hasOcrContent("**Page 1**\n\nHello")).toBe(true);
  });

  it("is true when a page has only a figure description", () => {
    expect(hasOcrContent(`**Page 1**\n\n${figureBlock(CHART)}`)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `bun run test:convex -- convex/_services/extraction/MistralOCRService.test.ts`
Expected: FAIL, `hasOcrContent` is not exported.

- [ ] **Step 3: Implement**

Add the import at the top of `MistralOCRService.ts` (with the other imports):

```ts
import { PAGE_LABEL_LINE } from "../processing/pageLabels";
```

Add after `stripMistralOcrMedia`:

```ts
const PAGE_LABEL_LINES = new RegExp(PAGE_LABEL_LINE.source, "gm");

/** Whether stitched OCR markdown holds anything beyond page labels and separators. */
export function hasOcrContent(markdown: string): boolean {
  return markdown.replace(PAGE_LABEL_LINES, "").replace(/^-{3,}[ \t]*$/gm, "").trim().length > 0;
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `bun run test:convex -- convex/_services/extraction/MistralOCRService.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(ocr): detect OCR output with no readable content" -- convex/_services/extraction/MistralOCRService.ts convex/_services/extraction/MistralOCRService.test.ts
```

---

### Task 4: Build the OCR request (input type and annotation formats)

**Files:**
- Modify: `convex/_services/extraction/MistralOCRService.ts`
- Test: `convex/_services/extraction/MistralOCRService.test.ts`

Task 0 confirmed the strict schema with the `kind` enum is accepted.

- [ ] **Step 1: Write the failing tests**

Add `buildOcrRequestBody` and `ocrInputKindForFile` to the import list, then:

```ts
describe("ocrInputKindForFile", () => {
  it("treats image extensions as images, case-insensitively", () => {
    for (const name of ["a.png", "b.JPG", "c.jpeg", "d.avif"]) expect(ocrInputKindForFile(name)).toBe("image");
  });

  it("treats everything else as a document", () => {
    for (const name of ["a.pdf", "b.pptx", "c.docx", "no-extension"]) {
      expect(ocrInputKindForFile(name)).toBe("document");
    }
  });
});

describe("buildOcrRequestBody", () => {
  it("sends documents as document_url with figure annotations", () => {
    const body = buildOcrRequestBody("https://x/a.pdf", "document", true);
    expect(body.document).toEqual({ type: "document_url", document_url: "https://x/a.pdf" });
    expect(body.model).toBe("mistral-ocr-latest");
    expect(body.table_format).toBe("markdown");
    expect(body).toHaveProperty("bbox_annotation_format");
    expect(body).not.toHaveProperty("document_annotation_format");
  });

  it("sends images as image_url with figure annotations", () => {
    const body = buildOcrRequestBody("https://x/storage/abc", "image", true);
    expect(body.document).toEqual({ type: "image_url", image_url: "https://x/storage/abc" });
    expect(body).toHaveProperty("bbox_annotation_format");
    expect(body).not.toHaveProperty("document_annotation_format");
  });

  it("leaves out annotation formats for the plain fallback request", () => {
    const body = buildOcrRequestBody("https://x/storage/abc", "image", false);
    expect(body).not.toHaveProperty("bbox_annotation_format");
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `bun run test:convex -- convex/_services/extraction/MistralOCRService.test.ts`
Expected: FAIL, `buildOcrRequestBody` / `ocrInputKindForFile` are not exported.

- [ ] **Step 3: Implement**

Add before `class MistralOCRService`:

```ts
const OCR_MODEL = "mistral-ocr-latest";

/** File extensions OCR reads as a single image rather than a paged document. */
export const IMAGE_FILE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".avif"];

export type OcrInputKind = "image" | "document";

/** Storage URLs carry no extension, so callers decide the input kind from the file name. */
export function ocrInputKindForFile(fileName: string): OcrInputKind {
  const ext = fileName.toLowerCase().slice(fileName.lastIndexOf("."));
  return IMAGE_FILE_EXTENSIONS.includes(ext) ? "image" : "document";
}

/** Schema for a figure description; its field descriptions steer the annotating model for any source. */
const FIGURE_ANNOTATION_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "figure_annotation",
    strict: true,
    schema: {
      title: "FigureAnnotation",
      type: "object",
      additionalProperties: false,
      required: ["kind", "description", "details"],
      properties: {
        kind: {
          type: "string",
          enum: ["chart", "diagram", "table", "photo", "screenshot", "equation", "logo", "other"],
          description: "What the image is.",
        },
        description: {
          type: "string",
          description: "What the image shows, in one or two plain sentences.",
        },
        details: {
          type: "string",
          description:
            "Text, labels, axis titles, values and trends visible in the image that a reader would need to answer questions about it. Empty for decorative images.",
        },
      },
    },
  },
};

export function buildOcrRequestBody(
  url: string,
  kind: OcrInputKind,
  annotate: boolean
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: OCR_MODEL,
    document:
      kind === "image"
        ? { type: "image_url", image_url: url }
        : { type: "document_url", document_url: url },
    table_format: "markdown",
    include_image_base64: false,
  };
  // No document_annotation_format: it restates the OCR text and invents content for photos.
  if (annotate) body.bbox_annotation_format = FIGURE_ANNOTATION_FORMAT;
  return body;
}
```

Leave the class untouched; Task 5 replaces it (including its `model` field) and switches it to `OCR_MODEL`.

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `bun run test:convex -- convex/_services/extraction/MistralOCRService.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(ocr): build OCR requests with image input and figure annotation formats" -- convex/_services/extraction/MistralOCRService.ts convex/_services/extraction/MistralOCRService.test.ts
```

---

### Task 5: `processDocument` — annotated call, plain fallback, empty-result error

**Files:**
- Modify: `convex/_services/extraction/MistralOCRService.ts` (the `MistralOCRService` class)
- Test: `convex/_services/extraction/MistralOCRService.test.ts`

- [ ] **Step 1: Write the failing tests**

Change the vitest import to `import { afterEach, describe, expect, it, vi } from "vitest";`, add to the module import list `MistralOCRService`, `MistralOcrTimeoutError`, `NOTHING_READABLE_MESSAGE`, `shouldRetryWithoutAnnotations`, add these imports:

```ts
import { ExternalServiceError } from "../../_lib/errors";
import { UserFacingSourceError } from "../../_lib/sourceFailure";
```

and the tests:

```ts
describe("shouldRetryWithoutAnnotations", () => {
  const http = (status: number) => new ExternalServiceError("mistral", `mistral HTTP ${status}`, { statusCode: status });

  it("falls back on a rejected request or a timeout", () => {
    expect(shouldRetryWithoutAnnotations(http(400))).toBe(true);
    expect(shouldRetryWithoutAnnotations(http(422))).toBe(true);
    expect(shouldRetryWithoutAnnotations(new MistralOcrTimeoutError())).toBe(true);
  });

  it("does not fall back on rate limits, server errors or unknown errors", () => {
    expect(shouldRetryWithoutAnnotations(http(429))).toBe(false);
    expect(shouldRetryWithoutAnnotations(http(503))).toBe(false);
    expect(shouldRetryWithoutAnnotations(new Error("boom"))).toBe(false);
  });
});

describe("MistralOCRService.processDocument", () => {
  afterEach(() => vi.unstubAllGlobals());

  const ok = (body: unknown) =>
    new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  const rejected = (status: number) =>
    new Response(JSON.stringify({ message: "rejected" }), { status, headers: { "Content-Type": "application/json" } });
  const sentBody = (fetchMock: ReturnType<typeof vi.fn>, call: number) =>
    JSON.parse((fetchMock.mock.calls[call][1] as RequestInit).body as string);

  it("asks for annotations and returns figure descriptions inline", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      ok({ pages: [{ markdown: "![img-0.jpeg](img-0.jpeg)", images: [{ id: "img-0.jpeg", image_annotation: JSON.stringify(CHART) }] }] })
    );
    vi.stubGlobal("fetch", fetchMock);

    const md = await new MistralOCRService("key").processDocument("https://x/a.pdf");

    expect(md).toBe(`**Page 1**\n\n${figureBlock(CHART)}`);
    expect(sentBody(fetchMock, 0)).toHaveProperty("bbox_annotation_format");
  });

  it("sends image uploads as image_url", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(ok({ pages: [{ markdown: "text" }] }));
    vi.stubGlobal("fetch", fetchMock);

    await new MistralOCRService("key").processDocument("https://x/storage/abc", { kind: "image" });

    expect(sentBody(fetchMock, 0).document).toEqual({ type: "image_url", image_url: "https://x/storage/abc" });
  });

  it("retries once without annotations when they are rejected", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(rejected(422))
      .mockResolvedValueOnce(ok({ pages: [{ markdown: "text" }] }));
    vi.stubGlobal("fetch", fetchMock);

    const md = await new MistralOCRService("key").processDocument("https://x/a.pdf");

    expect(md).toBe("**Page 1**\n\ntext");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sentBody(fetchMock, 1)).not.toHaveProperty("bbox_annotation_format");
  });

  it("falls back to the pre-annotation request for images: document_url, no annotations", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(rejected(400))
      .mockResolvedValueOnce(ok({ pages: [{ markdown: "text" }] }));
    vi.stubGlobal("fetch", fetchMock);

    await new MistralOCRService("key").processDocument("https://x/storage/abc", { kind: "image" });

    expect(sentBody(fetchMock, 0).document).toEqual({ type: "image_url", image_url: "https://x/storage/abc" });
    expect(sentBody(fetchMock, 1).document).toEqual({
      type: "document_url",
      document_url: "https://x/storage/abc",
    });
    expect(sentBody(fetchMock, 1)).not.toHaveProperty("bbox_annotation_format");
  });

  it("retries once without annotations when the annotated request times out", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("The operation was aborted"), { name: "AbortError" }))
      .mockResolvedValueOnce(ok({ pages: [{ markdown: "text" }] }));
    vi.stubGlobal("fetch", fetchMock);

    const md = await new MistralOCRService("key").processDocument("https://x/a.pdf");

    expect(md).toBe("**Page 1**\n\ntext");
    expect(sentBody(fetchMock, 1)).not.toHaveProperty("bbox_annotation_format");
  });

  it("fails with a user-facing message when nothing is readable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(ok({ pages: [{ markdown: "" }] })));

    const err = await new MistralOCRService("key")
      .processDocument("https://x/storage/abc", { kind: "image" })
      .catch((e) => e);

    expect(err).toBeInstanceOf(UserFacingSourceError);
    expect(err.userMessage).toBe(NOTHING_READABLE_MESSAGE);
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `bun run test:convex -- convex/_services/extraction/MistralOCRService.test.ts`
Expected: FAIL, missing exports and no fallback.

- [ ] **Step 3: Implement**

Update the imports at the top of `MistralOCRService.ts`:

```ts
import { invokeWithHttpRetry } from "../../_agents/_shared/retry";
import { createExternalServiceErrorFromResponse, ExternalServiceError } from "../../_lib/errors";
import { createServiceLogger } from "../../_lib/logging/serviceLogger";
import { UserFacingSourceError } from "../../_lib/sourceFailure";
import { PAGE_LABEL_LINE } from "../processing/pageLabels";
```

Add before the class:

```ts
/**
 * Annotations add a vision pass per figure (13s for a 24-page paper with 22 figures); the plain fallback is the
 * request that worked before them, with its old 60s timeout and 3 attempts. Capping the annotated call at 2
 * attempts keeps the worst case (every attempt a slow 5xx) at 2 × 120s + 3 × 60s = 420s, which leaves the
 * embedding job time to chunk and embed inside the 600s action limit.
 */
const ANNOTATED_TIMEOUT_MS = 120_000;
const ANNOTATED_MAX_ATTEMPTS = 2;
const PLAIN_TIMEOUT_MS = 60_000;

export const NOTHING_READABLE_MESSAGE =
  "We couldn't find any text or images to read in this file. If it's a photo, try a clearer or higher-resolution version.";

export class MistralOcrTimeoutError extends Error {
  constructor(options?: { cause?: unknown }) {
    super("Mistral OCR request timed out", options);
    this.name = "MistralOcrTimeoutError";
  }
}

/**
 * Whether a failed annotated request should be retried as plain OCR: a rejected request (4xx other
 * than 429) or a timeout. Rate limits and server errors are retried by `invokeWithHttpRetry` instead.
 */
export function shouldRetryWithoutAnnotations(error: unknown): boolean {
  if (error instanceof MistralOcrTimeoutError) return true;
  if (!(error instanceof ExternalServiceError) || error.statusCode === undefined) return false;
  return error.statusCode >= 400 && error.statusCode < 500 && error.statusCode !== 429;
}
```

Replace the whole class with:

```ts
export class MistralOCRService {
  private apiKey: string;
  private baseUrl = "https://api.mistral.ai/v1";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async callOcrEndpoint(
    body: Record<string, unknown>,
    timeoutMs: number,
    maxAttempts?: number
  ): Promise<MistralOcrResponse> {
    const logger = createServiceLogger("mistral", "ocr");

    return invokeWithHttpRetry(async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const t0 = Date.now();
        logger.apiCall("mistral", "/ocr", { model: OCR_MODEL });

        const response = await fetch(`${this.baseUrl}/ocr`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const data = await response.json();

        if (!response.ok) {
          const details = data ? JSON.stringify(data) : response.statusText;
          logger.apiError("mistral", "/ocr", new Error(`HTTP ${response.status}`));
          throw createExternalServiceErrorFromResponse(
            "mistral",
            response.status,
            "/ocr",
            details.slice(0, 400)
          );
        }

        logger.apiSuccess("mistral", "/ocr", Date.now() - t0, {});
        return data as MistralOcrResponse;
      } catch (error) {
        clearTimeout(timeoutId);
        if (error instanceof Error) {
          if (error.name === "AbortError") {
            throw new MistralOcrTimeoutError({ cause: error });
          }
          throw error;
        }
        throw new Error("Failed to process document with Mistral OCR", { cause: error });
      }
    }, "mistral_ocr", maxAttempts ? { maxAttempts } : undefined);
  }

  /**
   * OCR a file into page-labelled markdown with figure descriptions. `kind` must be "image" for
   * PNG/JPEG/AVIF files (see `ocrInputKindForFile`). Throws `UserFacingSourceError` when the file
   * has no text and no describable images.
   */
  async processDocument(url: string, options: { kind?: OcrInputKind } = {}): Promise<string> {
    const kind = options.kind ?? "document";
    const logger = createServiceLogger("mistral", "ocr");

    let data: MistralOcrResponse;
    try {
      data = await this.callOcrEndpoint(
        buildOcrRequestBody(url, kind, true),
        ANNOTATED_TIMEOUT_MS,
        ANNOTATED_MAX_ATTEMPTS
      );
    } catch (error) {
      if (!shouldRetryWithoutAnnotations(error)) throw error;
      logger.warn("OCR with figure annotations failed; retrying without annotations", {
        kind,
        error: error instanceof Error ? error.message : String(error),
      });
      // Exactly the request that worked before annotations, images included (they were sent as documents).
      data = await this.callOcrEndpoint(
        buildOcrRequestBody(url, "document", false),
        PLAIN_TIMEOUT_MS
      );
    }

    const markdown = stripMistralOcrMedia(
      markdownFromMistralOcrResponse(data, {
        onMalformedAnnotation: (imageId) =>
          logger.warn("Skipped a malformed figure annotation", { imageId }),
      })
    );
    if (!hasOcrContent(markdown)) {
      throw new UserFacingSourceError(
        NOTHING_READABLE_MESSAGE,
        "Mistral OCR returned no text or figure descriptions"
      );
    }
    return markdown;
  }

  async processFromUrl(url: string): Promise<string> {
    return this.processDocument(url);
  }
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `bun run test:convex -- convex/_services/extraction/`
Expected: PASS, including `urlSource.test.ts` and `AcademicLoaderService.test.ts` (unchanged).

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(ocr): annotate figures, fall back to plain OCR, fail on unreadable files" -- convex/_services/extraction/MistralOCRService.ts convex/_services/extraction/MistralOCRService.test.ts
```

---

### Task 6: Pass the input kind from the embedding job

**Files:**
- Modify: `convex/documents/embeddingJob.ts:16` (import), `:27-28` (extension list), `:206` (OCR call)

No unit test: `embeddingJob` is an `internalAction` without test coverage of this branch; `ocrInputKindForFile` is tested in Task 4.

- [ ] **Step 1: Update the import**

```ts
import {
  IMAGE_FILE_EXTENSIONS,
  MistralOCRService,
  ocrInputKindForFile,
} from "../_services/extraction/MistralOCRService";
```

- [ ] **Step 2: Build the OCR extension list from the shared image list**

```ts
// File extensions that require OCR processing
const OCR_FILE_EXTENSIONS = [...IMAGE_FILE_EXTENSIONS, ".pdf", ".pptx", ".docx"];
```

- [ ] **Step 3: Pass the kind**

Replace `extractedText = await mistralOCR.processDocument(fileUrl);` (inside the `needsOCR` branch) with:

```ts
          extractedText = await mistralOCR.processDocument(fileUrl, {
            kind: ocrInputKindForFile(docDetails.fileName),
          });
```

Leave the `ocrPdf: (url) => mistralOCR.processDocument(url)` call for URL sources as it is (PDFs are documents).

- [ ] **Step 4: Typecheck**

Run: `bun run typecheck:convex`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(sources): OCR uploaded images as images" -- convex/documents/embeddingJob.ts
```

---

### Task 7: Validation gates

- [ ] **Step 1: Format and lint the changed files**

Run: `bun x biome check --write convex/_services/extraction/MistralOCRService.ts convex/_services/extraction/MistralOCRService.test.ts convex/documents/embeddingJob.ts`
Expected: no remaining errors. Commit any formatting changes with `git commit -m "style: biome format" -- <paths>`.

- [ ] **Step 2: Typecheck (one at a time, not in parallel)**

Run: `bun run typecheck:convex` then `bun run typecheck:web`
Expected: both clean.

- [ ] **Step 3: Full Convex test suite**

Run: `bun run test:convex`
Expected: all pass.

- [ ] **Step 4: Targeted RAG eval**

Find a case whose sources are ingested through OCR: `grep -rln "\.pdf" evals/ | head`. If one exists, run `bun run eval:rag --case <id>` (space, not `=`) and compare with the last recorded result for that case. If no eval case ingests through OCR, note that in the PR description instead. Do not edit prompts to move eval numbers.

- [ ] **Step 5: End-to-end check (ask the user first)**

Deploying functions to the shared dev deployment can overwrite another session's work, so ask before running `npx convex dev --once`. With approval: start the web preview (`preview_start`), upload a chart PNG and a figure-heavy PDF to a notebook, and confirm in the source viewer that `> **Figure (…):**` blocks appear on the right pages. Also upload a blank image and confirm the source fails with the "couldn't find any text or images" message.

- [ ] **Step 6: Hand off**

Use superpowers:verification-before-completion, then superpowers:finishing-a-development-branch (PR title: `feat(ocr): describe images and figures during OCR`; check `gh pr list` for duplicates first).
