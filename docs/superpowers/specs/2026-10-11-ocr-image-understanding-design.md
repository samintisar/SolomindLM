# OCR image understanding — design

Slice 1 of 2 of the Mistral OCR upgrade. Slice 2 (text quality: header/footer separation, hyperlinks, low-confidence
warnings) gets its own spec and PR.

## Goal

Figures carry meaning into retrieval. Every chart, diagram, photo or table image that OCR detects inside a PDF, PPTX,
DOCX or uploaded image is described in text where it appears, so chat, studio and citations can use it. A file with
nothing readable fails visibly instead of becoming an empty source.

Describing a standalone photo or whole-image diagram that OCR detects no figure in is a follow-up (see Out of scope):
the probe showed OCR's whole-document annotation does not look at the picture.

## Problem

- Every OCR call goes through `MistralOCRService.callOcrEndpoint` (`convex/_services/extraction/MistralOCRService.ts`),
  used by uploaded files (`documents/embeddingJob.ts`), PDF links (`_services/extraction/urlSource.ts`) and
  open-access papers (`_services/extraction/AcademicLoaderService.ts`). It returns text only.
- OCR leaves an `![img-0.jpeg](img-0.jpeg)` placeholder for each figure; `stripMistralOcrMedia` deletes it. Every
  chart and diagram in a document is dropped.
- A standalone image (`.png`, `.jpg`, `.jpeg`, `.avif`) with little text — a chart, diagram or photo — yields almost
  nothing. Page stitching adds a `**Page 1**` label, so the result is never empty: the source is embedded with no
  content and nothing tells the user. For the same reason, `urlSource`'s "PDF OCR returned no text" check never fires.
- Images are sent as `type: "document_url"`; the documented input for images is `type: "image_url"`.

## Design

### 1. Request

`MistralOCRService` keeps its interface: `processDocument(url, options?)` returns markdown. `options.kind` is
`"image" | "document"` (default `"document"`); `embeddingJob` passes `"image"` for image extensions (the extension list
moves to one exported constant shared with `OCR_FILE_EXTENSIONS`). Other callers are unchanged.

A pure `buildOcrRequestBody(url, kind, annotate)` builds the body:

- `kind: "image"` → `document: { type: "image_url", image_url: url }`; otherwise
  `document: { type: "document_url", document_url: url }`.
- Always: `model: "mistral-ocr-latest"` (not pinned), `table_format: "markdown"`, `include_image_base64: false`.
- `annotate: true`: `bbox_annotation_format` with the figure schema below. No `document_annotation_format`: the probe
  showed it restates the OCR text, and for a photo without text it invents content ("a reference to section B.1").

Figure schema (strict JSON schema, `additionalProperties: false`, all fields required):

| Field | Type | Meaning |
| --- | --- | --- |
| `kind` | enum: `chart`, `diagram`, `table`, `photo`, `screenshot`, `equation`, `logo`, `other` | What the image is |
| `description` | string | What it shows, in one or two sentences |
| `details` | string | Visible text, labels, axis titles, values and trends a reader needs to answer questions about it; empty for decorative images |

Field descriptions are generic and must work for any source: no subject-specific wording, no references to eval
fixtures (AGENTS.md, Prompt authoring).

The annotated request's timeout rises from 60s to 120s (the probe measured 13s for a 24-page paper with 22 figures,
so this is headroom for long documents). The plain fallback in section 3 keeps today's 60s. Timeouts are not retried
by `invokeWithHttpRetry`, so the usual worst case (annotated timeout, then fallback) is about 180s. The annotated call
is capped at 2 attempts (the plain one keeps 3), so the pathological case — every attempt ending in a slow 5xx — is
2 × 120s + 3 × 60s = 420s, which leaves the embedding job time to chunk and embed inside the 600s action limit.

### 2. Response

A pure `inlineOcrFigures(markdown, images)` runs per page next to `inlineOcrTables`, before page stitching:

- For each image with a usable annotation, replace its `![id](id)` placeholder in place with:

  ```markdown
  > **Figure (chart):** Bar chart comparing quarterly revenue across three regions.
  > Details: Q1–Q4 on the x-axis; EMEA rises from 1.2M to 2.0M; APAC flat at about 0.8M.
  ```

  The `Details:` line is omitted when `details` is empty. Replacement uses a function replacer, so `$` in a
  description is literal.
- An image whose placeholder is missing gets its block appended at the end of its page (same rule as tables).
- Skipped (placeholder left for the stripper, as today): `kind: "logo"`, empty `description`, or an annotation that
  is missing or fails to parse. A parse failure is logged with the image id.
- The annotation is read from `image_annotation` (what OCR 4.1 returns, as a JSON string) or `bbox_annotation` (the
  name in Mistral's docs), as a JSON string or an object.

`stripMistralOcrMedia` still runs last and removes leftover placeholders; description blocks are plain text and pass
through. Descriptions stay inside their `**Page N**` section, so `StructuralChunker` page assignment and citation
pages are unaffected. `extractedMarkdown` (the source viewer's text view) shows the descriptions.

### 3. Failures

- **Nothing readable.** `hasOcrContent(markdown)` is false when nothing remains after removing page labels, `---`
  separators and whitespace. The service then throws `UserFacingSourceError` (`convex/_lib/sourceFailure.ts`) with:
  "We couldn't find any text or images to read in this file. If it's a photo, try a clearer or higher-resolution
  version." `embeddingJob` already stores `userMessage` for the source viewer. `urlSource` is unchanged: it wraps
  any OCR error in its link-specific "couldn't read the PDF at this link" message, which fits links better.
  `AcademicLoaderService` is unchanged: it already falls back to a web scrape when OCR throws.
- **Annotations rejected or too slow.** A 4xx response to the annotated request (other than 429), or its timeout,
  triggers one plain request (60s timeout), logged as a warning. The plain request is exactly the pre-annotation one:
  no `bbox_annotation_format`, and `document_url` for every file, images included (they were sent that way before),
  so annotations or the new `image_url` input never lose a document that ingests now. 429 and 5xx keep using
  `invokeWithHttpRetry`.
- **One bad annotation.** Skipped as in section 2; the rest of the document is unaffected.

### 4. Probe findings (2026-10-12, `mistral-ocr-latest`)

- Multi-figure PDF (24 pages): HTTP 200 in 13s; 22 figures, each with an `image_annotation` JSON string and a matching
  `![img-N.jpeg](img-N.jpeg)` placeholder. Descriptions were accurate; kinds were chart, diagram, table, screenshot,
  logo, photo, other. The strict schema with the `kind` enum was accepted.
- Standalone chart image: OCR emitted one figure for the chart, and its annotation included the plotted values.
- Standalone handwriting and receipt images: accurate OCR text, no figures.
- Standalone flowchart image: misread as a table, no figure emitted.
- Standalone photos (dog, cat): no figure emitted. One returned empty markdown; the other returned invented text
  ("B. 1"). The whole-document annotation described the text, not the picture.
- Mistral rejects `http://` image URLs (Convex storage URLs are `https`).

## Testing

TDD in `convex/_services/extraction/MistralOCRService.test.ts`:

- `inlineOcrFigures`: in-place replacement; annotation as string and as object, under either field name; logo,
  empty and malformed annotations skipped; missing placeholder → page end; `$` kept literal; empty `details` omits the
  `Details:` line.
- `buildOcrRequestBody`: `image_url` vs `document_url`; `bbox_annotation_format` only when annotating.
- `hasOcrContent`: labels and separators only → false; figure blocks only → true.
- Fallback: mocked `fetch` returning 400 (and, separately, aborting on timeout) for the annotated request, then 200 →
  one plain request without annotation formats; 429 does not trigger the fallback.
- Empty extraction → `UserFacingSourceError` with the "nothing readable" message. Existing `urlSource` and
  `AcademicLoaderService` tests already cover an OCR call that throws.

Gates: `typecheck:convex`, `typecheck:web`, `test:convex`, then one targeted `eval:rag --case …` whose sources contain
figures, to confirm retrieval does not regress. Ingestion has no prompt cache, so no `cacheVersions` bump.

## Out of scope

- Standalone image understanding (follow-up PR): one vision-chat call per uploaded image to describe photos and
  whole-image diagrams that OCR detects no figure in, and to stop invented OCR text on photos from being embedded.
- Slice 2: `extract_header` / `extract_footer`, keeping hyperlinks, confidence-score warnings.
- Block-level bounding boxes and citation highlighting on the page image.
- Re-processing existing sources. Users can Refresh a source to re-ingest it.
- Pinning an OCR model version.
