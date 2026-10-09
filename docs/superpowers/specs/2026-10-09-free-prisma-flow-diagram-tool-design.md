# Free PRISMA 2020 flow-diagram generator — design

Issue: #459 · Parent: #87 (SEO organic growth) · Date: 2026-10-09

## Goal

A public, no-signup page at `/tools/prisma-flow-diagram` where a reviewer types their counts and downloads
a PRISMA 2020 flow diagram as SVG or PNG. It targets "prisma flow diagram generator" searches and leads
into SolomindLM's literature review, which produces these counts automatically.

The tool runs entirely in the browser: no Convex function, no LLM call, no rate limit, no Turnstile.

## What the user sees

- Header, H1, intro (as `/tools/pdf-to-flashcards`).
- A two-pane tool card: the form, and a live diagram preview. Side by side from `lg`, stacked below.
- An export bar under the preview: **Download SVG**, **Download PNG**, **Copy link**, **Reset**.
- How-it-works steps, explainer sections, FAQ, related links, footer — all from the page config.
- A call to action card: "Get these numbers filled in for you" → the literature review (sign up / open app).

### Diagram

The PRISMA 2020 template for new systematic reviews (Page MJ et al., BMJ 2021;372:n71; CC BY 4.0), in
two variants chosen by a switch in the form:

1. **Databases and registers only** (default).
2. **Databases, registers and other sources**: adds the right-hand "other methods" column.

Boxes, left column (wording follows the published template; `n = ` is filled from the form):

| Phase | Box | Side box |
| --- | --- | --- |
| Identification | Records identified from: Databases (n), Registers (n) | Records removed before screening: Duplicate records removed (n), Records marked as ineligible by automation tools (n), Records removed for other reasons (n) |
| Screening | Records screened (n) | Records excluded (n) |
| Screening | Reports sought for retrieval (n) | Reports not retrieved (n) |
| Screening | Reports assessed for eligibility (n) | Reports excluded: one line per reason (n) |
| Included | Studies included in review (n), Reports of included studies (n) | — |

Other-methods column (variant 2): Records identified from: Websites (n), Organisations (n), Citation
searching (n) → Reports sought for retrieval (n) → Reports not retrieved (n) → Reports assessed for
eligibility (n) → Reports excluded: reasons (n). Its last box feeds the shared "Studies included" box.

Header bars: "Identification of studies via databases and registers" and, in variant 2, "Identification
of studies via other methods". Phase labels run down the left edge. Arrows connect each main box to the
next and to its side box.

Style: white background, black 1px borders, black text, light grey header bars and phase labels, a
system sans-serif stack (`Arial, Helvetica, sans-serif`) so the exported file renders the same anywhere
and canvas PNG export needs no web-font loading. It stays white in dark mode: it is a manuscript figure,
not app chrome. An empty field prints `(n = )`, as the blank template does.

Attribution under the diagram on the page (not inside the exported image): "Template: PRISMA 2020
(Page MJ et al., BMJ 2021;372:n71), CC BY 4.0." The page's FAQ explains the template and its licence.

### Form

- Number inputs (integers ≥ 0, blank allowed) grouped by phase, labelled with the box wording.
- Exclusion reasons: rows of (reason text, count) with add, remove and inline rename; starts with three
  empty rows ("Reason 1"… placeholders). Up to 12 rows per column.
- Variant switch: "Include other methods (websites, citation searching)".
- Count warnings (below) appear next to the field they concern; they never block or alter the diagram.

### Count warnings

Pure checks over the form state; each returns `{ field, message }`. Only run when every number the check
needs is filled in.

1. Records screened ≠ databases + registers − duplicates − automation − other removed.
2. Reports sought > records screened − records excluded.
3. Reports assessed ≠ reports sought − reports not retrieved (per column).
4. Reports assessed − sum of exclusion reasons, added over both columns, ≠ reports of included studies.
   (The included box is shared, so the check runs on the totals, not per column.)
5. Studies included > reports of included studies.

Messages state both numbers, e.g. "Identified 412 − removed 87 = 325, but screened is 320."

## Units

All new code lives in `apps/web/src/features/tools/`.

| Unit | Purpose | Depends on |
| --- | --- | --- |
| `lib/prismaFlow.ts` | Form state type, empty/default state, `checkPrismaCounts(state)` warnings | nothing |
| `lib/prismaUrlState.ts` | `encodePrismaState` / `decodePrismaState` to and from the URL hash; decode never throws, ignores unknown keys, clamps to valid values | `prismaFlow` types |
| `lib/prismaLayout.ts` | Pure layout: box rectangles, wrapped text lines, arrows, total size for a state and variant; `wrapText(text, maxChars)` | `prismaFlow` types |
| `components/PrismaDiagram.tsx` | Renders the layout as one `<svg>` with inline attributes only (no classes, no CSS variables) so the serialized SVG is self-contained | `prismaLayout` |
| `lib/exportDiagram.ts` | `downloadSvg(svg, name)`; `downloadPng(svg, name, scale = 2)` via `Image` + `canvas.toBlob` | DOM |
| `components/PrismaForm.tsx` | The form, reason rows and variant switch; warnings inline | `prismaFlow`, ui primitives |
| `pages/PrismaFlowDiagramPage.tsx` | Page shell, state, hash sync, export bar, content sections | the above, `toolPages` |

Text wrapping is character-count based with a fixed font size, so layout is deterministic and testable
without measuring text in the DOM.

### URL state

The state lives in the hash (`#d=<base64url JSON>`): it is never sent to the server, does not change the
canonical URL, and survives a reload or a shared link. Writes are debounced (300 ms) with
`history.replaceState`. A hash that fails to decode is ignored and the default state loads.

## Wiring

- `toolPages.ts`: add `PRISMA_FLOW_DIAGRAM_PAGE` to `FREE_TOOL_PAGES`. This alone registers the SEO page
  (WebApplication, HowTo, FAQ, Breadcrumb structured data), the prerendered crawler body and the footer
  link.
- `shell/publicRoutes.tsx`: lazy route for the page.
- `public/sitemap.xml` (via `scripts/generate-sitemap.ts`) and `public/llms.txt`: add the URL.
- Related links: `/research/ai-literature-review`, `/research/academic-paper-discovery` and `/compare`.
  `/research/ai-literature-review` links back to the tool. #460 will link the Rayyan and Covidence pages
  here.
- The native mobile shell redirects away from tool pages, as the flashcards page does.

## Copy guardrails

No "PRISMA compliant" or "PRISMA approved" claims. The page says it draws a diagram in the PRISMA 2020
format; following the reporting guideline is the author's job.

## Testing

- Unit (vitest, `*.test.ts` beside the source): `checkPrismaCounts` for each warning and for partial
  input; URL encode/decode round trip, garbage, oversized and out-of-range input; `wrapText`; layout
  box count and ordering for both variants.
- Component: typing into the form updates the SVG text; adding a reason adds a line; the variant switch
  adds the other-methods header.
- SEO: `seoHtml.test.ts` registers the page and prerenders its H1, steps and FAQ.
- `isPublicPath.test.ts` covers the new path.
- E2E: `e2e/tools/prisma-flow-diagram.spec.ts` — load signed out, fill counts, see them in the diagram,
  download SVG (file name and `<svg` content), reload restores the state from the hash. Add the path to
  `e2e/csp/csp.spec.ts` public routes.

## Out of scope

Updated-review variants (previous studies column), DOCX export, saving diagrams to an account,
prefilling from a SolomindLM literature review run, translations.
