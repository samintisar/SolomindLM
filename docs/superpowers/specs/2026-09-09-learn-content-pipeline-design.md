# `/learn` editorial content pipeline — design

**Issue:** #88 (part of SEO tracking issue #87)
**Date:** 2026-09-09
**Status:** Approved for planning

## Problem

The current "guides" are hand-authored TypeScript objects in
`apps/web/src/features/landing/seoContentPages.ts`. That does not scale to the
100+ articles topical authority needs: no per-article publish/update dates, no
author byline, and every content change is a `.ts` edit that must pass typecheck.
We need a real content surface at `/learn` so non-trivial editorial volume is
possible without hand-writing structured TS for every post.

## Goals

- Author posts as Markdown files with frontmatter, not TypeScript.
- Reuse the existing SEO pipeline unchanged in shape: one registry feeds
  prerender (`scripts/prerender-seo.ts`), sitemap (`scripts/generate-sitemap.ts`),
  and IndexNow sync (`scripts/indexnow-sync.ts`).
- Per-post `datePublished` / `dateModified` and author byline, surfaced in
  `Article` JSON-LD and visible copy.
- A `/learn` index page grouped by cluster, itself prerendered and in the sitemap.
- Each post links up to its cluster hub (`/students` or `/research`) and across
  to a relevant intent page.

## Non-goals

- Writing the article content (that is #89).
- CMS/admin UI, comments, RSS.
- MDX / interactive components in content (plain Markdown only).
- Removing the app JS bundle from marketing routes — that is #94, which the
  acceptance criterion defers to and which covers `/learn` along with the other
  marketing routes.

## Architecture

`/learn` posts follow the **same architecture as the existing SEO page families**
(cluster hubs, intent landing pages, `seoContentPages`):

1. A config registry (`LEARN_POSTS`).
2. Registry entries mapped into `PublicSeoPage[]` in
   `apps/web/src/shared/seo/publicSeoPages.ts`, so sitemap + IndexNow pick them
   up with no further wiring.
3. A prerender-body builder registered in `buildPublicSeoPrerenderBody`
   (`apps/web/src/shared/seo/publicSeoPrerenderHtml.ts`).
4. A React route per post in `apps/web/src/App.tsx` that hydrates over the
   prerendered body.

The **only** difference from `seoContentPages.ts` is the source of the registry:
parsed from `.md` files at build time instead of hand-written TS objects.

### Why build-time codegen

The registry is consumed by two runtimes:

- the Vite browser bundle (`App.tsx` and the React page components), and
- standalone `bun` scripts (`prerender-seo.ts`, `generate-sitemap.ts`) that do
  **not** run through Vite.

A Vite markdown plugin cannot serve the `bun` scripts, and a runtime Markdown
parser in the shared module would ship ~35 KB of `marked` into the browser
bundle (fighting #94) while still needing a separate parser path for the
scripts. Instead, a single build-time script parses the `.md` files once and
writes a committed JSON artifact that both runtimes import. The Markdown and
frontmatter parsers are **devDependencies** and never reach the browser.

### Components

| Unit | Responsibility | Depends on |
|---|---|---|
| `apps/web/content/learn/*.md` | Authored posts: YAML frontmatter + GFM Markdown body | — |
| `apps/web/scripts/build-learn-content.ts` | Parse `.md` → validate frontmatter → render body HTML → write `learnPosts.generated.json`. Fails the build on invalid/missing required frontmatter, duplicate slugs, bad dates, or an unresolvable `relatedIntentPath`. | `gray-matter`, `marked` (devDeps); `intentLandingPages`, `clusterHubPages`, `seoContentPages` for path validation |
| `apps/web/src/features/landing/learnPosts.generated.json` | Committed generated artifact: array of post entries | — |
| `apps/web/src/features/landing/learnPosts.ts` | Import the JSON, type it as `LearnPost[]`, expose `LEARN_POSTS`, `getLearnPostBySlug`, `getLearnPostsByCluster`, `getLearnPaths`, `isLearnPath`, `getLearnBreadcrumbItems`, `slugFromLearnPath` | the generated JSON |
| `apps/web/src/shared/seo/learnPrerenderHtml.ts` | `buildLearnPostPrerenderBody(post)` and `buildLearnIndexPrerenderBody()` | `learnPosts.ts`, `seoHtml` (`escapeHtml`) |
| `apps/web/src/features/landing/LearnPostPage.tsx` | React route component: `SEOMeta` + header + `<article>` rendering `bodyHtml` in a `prose` container + byline + related links + `Footer` | `learnPosts.ts`, existing landing UI |
| `apps/web/src/features/landing/LearnIndexPage.tsx` | React route component: `SEOMeta` + header + intro + posts grouped by cluster + `Footer` | `learnPosts.ts`, existing landing UI |

### Data flow

**Build:**
```
content/learn/*.md
  → bun run scripts/build-learn-content.ts (gray-matter + marked, path validation)
  → src/features/landing/learnPosts.generated.json   (committed)
  → vite build
  → scripts/prerender-seo.ts       (LEARN_SEO_PAGES → per-post /learn/<slug>/index.html + /learn/index.html)
  → scripts/generate-sitemap.ts    (same entries → sitemap.xml)
  → scripts/indexnow-sync.ts       (same entries → IndexNow queue/submit)
```

**Runtime:** `App.tsx` renders one `<Route>` per `LEARN_POSTS` entry plus
`/learn`; each page component reads its entry from `learnPosts.ts` and hydrates
over the prerendered body.

## Frontmatter schema

`apps/web/content/learn/<slug>.md` — the filename is the slug.

| Field | Required | Type | Purpose / default |
|---|---|---|---|
| `title` | yes | string | `<title>`, `og:title`, index card heading |
| `description` | yes | string | meta description, `og:description` |
| `datePublished` | yes | `YYYY-MM-DD` | `Article` JSON-LD `datePublished`, byline |
| `cluster` | yes | `"students"` \| `"research"` | grouping on `/learn`; the "up" link target (`/students` or `/research`) |
| `dateModified` | no | `YYYY-MM-DD` | JSON-LD `dateModified`, sitemap `lastmod`. Defaults to `datePublished` |
| `author` | no | string | byline + JSON-LD author. Default `"SolomindLM"`. A real name emits `Person`; `"SolomindLM"` keeps the current `Organization` author |
| `relatedIntentPath` | no | string | the "across" link, e.g. `/students/ai-flashcards`. Build **fails** if it does not resolve to a known cluster-hub / intent / SEO-content path |
| `keywords` | no | string | meta keywords |
| `canonical` | no | absolute URL | override for syndicated posts. Default `${SEO_BASE_URL}/learn/<slug>` |
| `ogImage` | no | string | default `SEO_DEFAULT_OG_IMAGE` |
| `h1` | no | string | visible `<h1>`. Default `title` |
| `navLabel` | no | string | breadcrumb + index card label. Default `title` |
| `draft` | no | boolean | `true` → excluded entirely: no JSON entry, route, sitemap entry, or prerender |

Body is plain GFM Markdown. A leading `# H1` in the body is stripped (frontmatter
`h1`/`title` is authoritative — avoids a double `<h1>`). H2/H3 headings are
slugified with anchor IDs and collected into `headings` for an optional TOC.

### Generated entry shape (`LearnPost`)

```ts
type LearnPost = {
  slug: string;
  path: string;                 // "/learn/<slug>"
  title: string;
  description: string;
  h1: string;
  navLabel: string;
  keywords?: string;
  datePublished: string;        // YYYY-MM-DD
  dateModified: string;         // YYYY-MM-DD
  author: string;
  cluster: "students" | "research";
  canonicalUrl: string;         // absolute
  ogImage: string;
  relatedIntentPath?: string;
  bodyHtml: string;             // rendered GFM, first-party/trusted
  headings: { depth: 2 | 3; text: string; id: string }[];
  readingTimeMinutes: number;
};
```

## Shared-helper changes

Two small, generally-useful additions:

1. **`generateArticleStructuredData`** (`apps/web/src/shared/seo/structuredData.ts`)
   gains an optional `author?: string` param. When set and not `"SolomindLM"`, the
   `author` field becomes `{ "@type": "Person", name }`; otherwise the existing
   `Organization` author is emitted unchanged. Existing callers pass nothing and
   are unaffected.

2. **`PublicSeoPage`** (`publicSeoPages.ts`) and **`SeoHeadInput`**
   (`seoHtml.ts`) gain an optional `canonicalUrl?: string` (absolute override).
   `seoPageToHeadInput` copies it through; `applySeoToHtml` gets a one-line
   change to use `seo.canonicalUrl ?? canonicalUrl(baseUrl, seo.canonicalPath)`.
   The sitemap generator prefers `page.canonicalUrl` over
   `canonicalUrl(SEO_BASE_URL, path)` when present. Only `/learn` posts set it
   today, and only when a post's frontmatter supplies `canonical`.

## `PublicSeoPage` mapping

In `publicSeoPages.ts`, mirroring `SEO_CONTENT_SEO_PAGES`:

```ts
const LEARN_SEO_PAGES: PublicSeoPage[] = LEARN_POSTS.map((post) => ({
  path: post.path,
  title: post.title,
  description: post.description,
  keywords: post.keywords,
  ogType: "article",
  ogImage: post.ogImage,
  canonicalUrl: post.canonicalUrl,
  changefreq: "monthly",
  priority: 0.7,
  lastmod: post.dateModified,
  structuredData: [
    generateBreadcrumbStructuredData(getLearnBreadcrumbItems(post)),
    generateArticleStructuredData({
      headline: post.h1,
      description: post.description,
      path: post.path,
      datePublished: post.datePublished,
      dateModified: post.dateModified,
      articleType: "Article",
      author: post.author,
    }),
  ],
}));

const LEARN_INDEX_SEO_PAGE: PublicSeoPage = {
  path: "/learn",
  title: "Learn — study & research guides | SolomindLM",
  description: "Guides on studying from your own materials and running AI-assisted research with SolomindLM.",
  changefreq: "weekly",
  priority: 0.6,
  structuredData: [
    generateBreadcrumbStructuredData([
      { name: "Home", path: "/" },
      { name: "Learn", path: "/learn" },
    ]),
    // ItemList of posts (see implementation)
  ],
};
```

Both are appended to `PUBLIC_SEO_PAGES` after `SEO_CONTENT_SEO_PAGES`.

## Routes (`App.tsx`)

```tsx
<Route path="/learn" element={<LearnIndexPage />} />
{LEARN_POSTS.map((post) => (
  <Route key={post.path} path={post.path} element={<LearnPostPage slug={post.slug} />} />
))}
```

`isLearnPath(location.pathname)` is added to the `isPublicPage` expression
alongside `isSeoContentPath` etc.

## Prerender bodies

Registered in `buildPublicSeoPrerenderBody`:

```ts
if (path === "/learn") return buildLearnIndexPrerenderBody();
const learnPost = getLearnPostBySlug(slugFromLearnPath(path));
if (learnPost) return buildLearnPostPrerenderBody(learnPost);
```

`buildLearnPostPrerenderBody(post)` mirrors `buildSeoContentPrerenderBody`:

- `<nav aria-label="Breadcrumb">` → Home / Learn / `navLabel`
- `<article data-seo-prerender="true" id="seo-prerender-content">`
  - `<header>`: `<h1>${h1}</h1>`, byline `By ${author} · Published ${datePublished} · Updated ${dateModified}`
  - `bodyHtml` injected as-is (already HTML; authored, trusted)
  - "Related" `<section>`: link to the cluster hub (`/students` or `/research`) and, when set, `relatedIntentPath`
  - `<footer>` with a home link

`buildLearnIndexPrerenderBody()`: `<h1>`, intro paragraph, then one `<section>`
per non-empty cluster with an `<ul>` of `<li><a href="/learn/<slug>">navLabel</a></li>`.

## React components

**`LearnPostPage.tsx`** — reuses the `SeoContentHeader` markup pattern from
`SeoContentPage.tsx` (extract a shared `MarketingHeader` if it is a clean lift;
otherwise duplicate the ~20 lines, matching current practice). Renders:
`SEOMeta` (title/description/keywords/`ogType="article"`; if `SEOMeta` does not
already accept a canonical override it derives one from `pagePath`, which is
correct for non-syndicated posts — a `canonical` prop is added only if a seed
post needs the override) → hero (`h1`, byline) → `<div className="prose …" dangerouslySetInnerHTML={{ __html: post.bodyHtml }} />`
→ related links (cluster hub + `relatedIntentPath`) → `Footer`.
`isNativeShell()` redirect behavior matches `SeoContentPage`.

**`LearnIndexPage.tsx`** — `SEOMeta` → header → intro → **"For students"**
section (cards + a link to `/students`) and **"For researchers"** section (cards
+ a link to `/research`); empty clusters omitted. Each card shows `navLabel`,
`description`, and `datePublished` / `dateModified`. → `Footer`.

### Trusted-content assumption

`bodyHtml` comes from committed `.md` files authored by the team. There is no
user input in this path, so `dangerouslySetInnerHTML` without a runtime
sanitizer is acceptable. If external contributions are ever accepted, add a
sanitize step in `build-learn-content.ts` (build-time, still no browser cost).

## Markdown rendering

`build-learn-content.ts` uses `marked` with:

- GFM enabled.
- A custom heading renderer that slugifies heading text to an `id` and records
  `{ depth, text, id }` for `headings` (depths 2 and 3 only).
- Leading top-level `#` heading stripped before render.
- `readingTimeMinutes` = `ceil(wordCount / 200)`.

`marked` v5+ changed the renderer API and parse is synchronous by default; the
exact renderer hook signature and any needed `marked.use({ … })` options are
confirmed against current `marked` docs during implementation (per the
`find-docs` / context7 workflow). `gray-matter`'s `matter(fileContents)` returns
`{ data, content }`.

## Build / dev wiring (`apps/web/package.json`)

```jsonc
"learn:build": "bun run scripts/build-learn-content.ts",
"learn:check": "bun run scripts/build-learn-content.ts --check",  // regenerate + fail if JSON changed
"build": "bun run learn:build && vite build && bun run scripts/prerender-seo.ts && bun run scripts/generate-sitemap.ts && bun run scripts/indexnow-sync.ts",
"dev": "bun run kill-port && bun run learn:build && vite",
```

- The generated JSON is committed so `typecheck:web`, `lint`, and CI need no
  pre-step.
- `--check` mode (regenerate to a temp buffer, compare to the committed file,
  non-zero exit on drift) is available for a pre-push/CI guard. Wiring it into
  the pre-push hook or CI is a follow-up, not a blocker: a stale commit still
  produces correct output on the next `bun run build`; the only cost is a stale
  diff in review.
- New `apps/web` devDependencies: `gray-matter`, `marked` (latest stable, pinned
  during implementation). No new runtime dependencies.

## Seed content

Ship exactly one real post so `/learn` is not empty and tests have a genuine
fixture:

`apps/web/content/learn/how-to-turn-lecture-slides-into-flashcards.md`
- `cluster: students`
- `relatedIntentPath: /students/ai-flashcards`
- `author: SolomindLM`
- Short, generalized, genuinely useful how-to. The 12-article "how to study"
  cluster is #89.

## Testing

Vitest, co-located, matching existing SEO test placement.

1. **`apps/web/src/features/landing/learnPosts.test.ts`** (new)
   - `LEARN_POSTS` is non-empty; every entry has the required fields.
   - Slugs are unique; `path` is `/learn/<slug>`.
   - `datePublished` / `dateModified` are valid ISO `YYYY-MM-DD`; `dateModified >= datePublished`.
   - Every `relatedIntentPath` (when set) resolves via the existing
     `isIntentLandingPath` / `isClusterHubPath` / `isSeoContentPath` helpers.
   - `cluster` is one of the allowed values.

2. **`apps/web/src/shared/seo/seoHtml.test.ts`** (extend) — the "smoke test
   asserts one sample post's `<head>`" acceptance criterion.
   - For the seed post: `applySeoToHtml(MINIMAL_HTML, SEO_BASE_URL, seoPageToHeadInput(page))`
     contains the correct `<title>`, `<meta name="description">`, `og:type` =
     `article`, and `<link rel="canonical" href="…/learn/how-to-turn-lecture-slides-into-flashcards">`.
   - The emitted `Article` JSON-LD contains `datePublished` and `dateModified`
     equal to the frontmatter values.
   - `/learn` index page head: title, canonical `…/learn`, BreadcrumbList JSON-LD.

3. **`apps/web/src/shared/seo/learnPrerenderHtml.test.ts`** (new)
   - `buildLearnPostPrerenderBody(seed)` contains the `h1`, the byline with the
     author and both dates, at least one body heading, and the related links
     (cluster hub + `relatedIntentPath`).
   - `buildLearnIndexPrerenderBody()` lists the seed post under the students
     cluster and does not emit an empty research section.

4. **`generateArticleStructuredData`** unit test (extend
   `structuredData.test.ts`): `author: "Jane Doe"` → `author["@type"] === "Person"`;
   omitted / `"SolomindLM"` → `Organization` (unchanged).

## Acceptance criteria mapping

| Issue #88 criterion | Covered by |
|---|---|
| New file → prerendered `/learn/<slug>/index.html` with title, description, canonical, OG | `build-learn-content.ts` + `LEARN_SEO_PAGES` mapping + `prerender-seo.ts` (unchanged); tests §2 |
| `Article` structured data with `datePublished` / `dateModified` from frontmatter | `generateArticleStructuredData` in the mapping; test §2 |
| New posts in `sitemap.xml` and pushed via IndexNow on build | `LEARN_SEO_PAGES` in `PUBLIC_SEO_PAGES` → existing sitemap + IndexNow scripts, no change |
| `/learn` index lists posts grouped by cluster, prerendered, in sitemap | `LearnIndexPage` + `buildLearnIndexPrerenderBody` + `LEARN_INDEX_SEO_PAGE`; test §2, §3 |
| Posts do not pull the app JS bundle | Deferred to #94 (issue explicitly points there); this design keeps the marketing/app route split as-is |
| `bun run build` succeeds; `typecheck:web` + `lint` pass; smoke test on one post's `<head>` | Build wiring; committed JSON; tests §2 |

## Risks / trade-offs

- **Committed generated JSON can go stale in a PR.** Mitigated by `learn:check`
  and regeneration inside `bun run build`; a stale commit never produces wrong
  output, only a confusing diff.
- **Header markup duplication** between `SeoContentPage` and the new pages. The
  plan extracts a shared `MarketingHeader` only if it is a clean lift; otherwise
  it matches the current practice of small duplication across landing pages.
- **`marked` renderer API** differs by major version; resolved by checking
  current docs during implementation rather than relying on training data.
