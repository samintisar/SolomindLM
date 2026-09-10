# `/learn` Editorial Content Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let editors author `/learn` posts as Markdown files with frontmatter that flow automatically into the existing prerender + sitemap + IndexNow pipeline, plus a `/learn` index page grouped by cluster.

**Architecture:** A build-time script parses `apps/web/content/learn/*.md` (gray-matter + marked) into a committed `learnPosts.generated.json`. A typed `learnPosts.ts` module exposes that data. Registry entries map into `PublicSeoPage[]` in `publicSeoPages.ts` (so sitemap + IndexNow need no change) and into a prerender-body builder registered in `buildPublicSeoPrerenderBody`. React routes in `App.tsx` hydrate over the prerendered bodies. This mirrors the existing cluster-hub / intent / `seoContentPages` families; the only novelty is the Markdown source and its codegen step.

**Tech Stack:** TypeScript, Bun, Vite 7, React 19, React Router 7, Vitest, Biome. New devDependencies: `gray-matter`, `marked`. No new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-09-09-learn-content-pipeline-design.md`

---

## File Structure

**Create:**

| Path | Responsibility |
|---|---|
| `apps/web/content/learn/how-to-turn-lecture-slides-into-flashcards.md` | The single seed post (real content; the 12-post cluster is #89) |
| `apps/web/scripts/build-learn-content.ts` | Parse `.md` → validate frontmatter → render body HTML + headings → write the generated JSON. `--check` mode fails if the committed JSON is stale |
| `apps/web/src/features/landing/learnPosts.generated.json` | Committed generated artifact: `LearnPost[]` |
| `apps/web/src/features/landing/learnPosts.ts` | Types the JSON, exposes `LEARN_POSTS` + helpers (`getLearnPostBySlug`, `getLearnPostsByCluster`, `isLearnPath`, `slugFromLearnPath`, `getLearnBreadcrumbItems`, `getLearnClusterHub`) |
| `apps/web/src/features/landing/learnPosts.test.ts` | Data-shape assertions (matches `seoContentPages.test.ts` style) |
| `apps/web/src/shared/seo/learnPrerenderHtml.ts` | `buildLearnPostPrerenderBody(post)`, `buildLearnIndexPrerenderBody()` |
| `apps/web/src/shared/seo/learnPrerenderHtml.test.ts` | Prerender-body assertions |
| `apps/web/src/features/landing/LearnPostPage.tsx` | React route component for a post |
| `apps/web/src/features/landing/LearnIndexPage.tsx` | React route component for `/learn` |

**Modify:**

| Path | Change |
|---|---|
| `apps/web/package.json` | `gray-matter` + `marked` devDeps; `learn:build` / `learn:check` scripts; prepend `learn:build` to `build` and `dev` |
| `biome.json` | Ignore `learnPosts.generated.json` |
| `apps/web/src/shared/seo/structuredData.ts` | `generateArticleStructuredData` gains optional `author?: string` → `Person` when set and not `"SolomindLM"` |
| `apps/web/src/shared/seo/structuredData.test.ts` | Author-param cases |
| `apps/web/src/shared/seo/seoHtml.ts` | `SeoHeadInput.canonicalUrl?`, `seoPageToHeadInput` passthrough, `applySeoToHtml` prefers it |
| `apps/web/src/shared/seo/seoHtml.test.ts` | Canonical-override case + seed-post `<head>` smoke test |
| `apps/web/src/shared/seo/publicSeoPages.ts` | `PublicSeoPage.canonicalUrl?`; `LEARN_SEO_PAGES` + `LEARN_INDEX_SEO_PAGE`; append both to `PUBLIC_SEO_PAGES` |
| `apps/web/src/shared/seo/publicSeoPrerenderHtml.ts` | Register `/learn` and `/learn/<slug>` in `buildPublicSeoPrerenderBody` |
| `apps/web/src/shared/seo/SEOMeta.tsx` | Read `registryPage.canonicalUrl`; don't double-prefix an absolute canonical |
| `apps/web/scripts/generate-sitemap.ts` | Prefer `page.canonicalUrl` for `<loc>` |
| `apps/web/src/App.tsx` | Import + render `/learn` and per-post routes; add `isLearnPath` to `isPublicPage` |

**No change needed:** `scripts/prerender-seo.ts`, `scripts/indexnow-sync.ts`, and the `indexNow*` modules — they iterate `getIndexablePublicSeoPages()` generically and pick up the new entries for free.

---

## Task 1: Dependencies, seed post, biome ignore

**Files:**
- Modify: `apps/web/package.json`
- Modify: `biome.json`
- Create: `apps/web/content/learn/how-to-turn-lecture-slides-into-flashcards.md`

- [ ] **Step 1: Add devDependencies**

Run from `apps/web/`:

```bash
bun add -D gray-matter marked
```

Expected: `apps/web/package.json` `devDependencies` gains `gray-matter` and `marked`; `bun.lock` updates.

- [ ] **Step 2: Add the content-pipeline scripts to `apps/web/package.json`**

In the `"scripts"` block, add `learn:build` and `learn:check`, and prepend `bun run learn:build &&` to `build` and `dev`:

```jsonc
"kill-port": "bun run scripts/kill-port.ts",
"dev": "bun run kill-port && bun run learn:build && vite",
"build": "bun run learn:build && vite build && bun run scripts/prerender-seo.ts && bun run scripts/generate-sitemap.ts && bun run scripts/indexnow-sync.ts",
"learn:build": "bun run scripts/build-learn-content.ts",
"learn:check": "bun run scripts/build-learn-content.ts --check",
"indexnow:flush": "bun run scripts/indexnow-flush.ts",
```

- [ ] **Step 3: Exclude the generated JSON from Biome**

In `biome.json`, add one entry to `files.includes` (leave `linter.includes` / `formatter.includes` as-is — `files.includes` governs all of them):

```jsonc
"files": {
  "ignoreUnknown": false,
  "includes": [
    "**",
    "!.agents/**",
    "!convex/_generated/**",
    "!apps/web/src/convex-generated-api.d.ts",
    "!apps/web/src/convex-generated-dataModel.d.ts",
    "!apps/web/src/features/landing/learnPosts.generated.json"
  ]
},
```

- [ ] **Step 4: Write the seed post**

Create `apps/web/content/learn/how-to-turn-lecture-slides-into-flashcards.md`:

```markdown
---
title: "How to Turn Lecture Slides Into Flashcards With AI"
description: "A repeatable workflow for converting lecture slide decks into study-ready flashcards with SolomindLM, then reviewing them with spaced repetition."
datePublished: "2026-09-09"
cluster: students
author: SolomindLM
relatedIntentPath: /students/ai-flashcards
keywords: "lecture slides to flashcards, ai flashcards from slides, study from powerpoint with ai"
navLabel: "Lecture slides to flashcards"
---

Lecture slides are dense but uneven: some slides carry a whole concept, others
are a single label on a diagram. Turning them into flashcards by hand means
retyping the useful 20% and skipping the rest. This is the workflow we recommend
for doing that conversion with AI while keeping the cards grounded in your own
deck.

## Start with the slide deck as your source

Create a notebook and upload the slide deck as-is — PDF or the original
presentation file. Add the matching lecture recording or your own notes if you
have them; extra context makes the generated cards more precise. Keep one
notebook per course or per exam so the source set stays focused.

## Ask questions before you generate

Before generating anything, use chat to check that the deck is complete and that
you understand it. Ask for the key claims in a section, the definitions you are
expected to memorise, and the relationships between concepts that span several
slides. If chat cannot answer from the deck, you are missing a source — add it
now rather than generating cards with gaps.

## Generate and trim the deck

Select the slides you want, open the flashcards tool, and generate a draft deck.
Treat the output as a first pass:

- Delete cards that restate a slide title without testing anything.
- Merge near-duplicate cards that came from repeated slide headers.
- Split any card whose answer is really three facts into three cards.
- Fix wording against the slide — the card should match how your instructor
  phrased it, not a paraphrase.

## Review with spaced repetition

Study the trimmed deck in spaced-repetition mode so the interval between reviews
grows as you get cards right. Short daily sessions beat one long session before
the exam. When a card keeps failing, open the source slide again instead of
rereading the card — the fix is almost always that the card is testing the wrong
thing.

## Common pitfalls

- **Generating from the whole deck at once.** Work section by section so you can
  judge each batch of cards.
- **Keeping every card.** A smaller deck you actually finish reviewing beats a
  complete deck you abandon.
- **Never re-checking the source.** Cards drift from the material as you edit
  them; verify against the slide before an exam.
```

- [ ] **Step 5: Verify the seed post parses as valid YAML frontmatter**

Run from `apps/web/`:

```bash
bun -e 'const m=require("gray-matter"); const fs=require("node:fs"); const p=m(fs.readFileSync("content/learn/how-to-turn-lecture-slides-into-flashcards.md","utf-8")); console.log(JSON.stringify(p.data,null,2)); console.log("body chars:", p.content.length)'
```

Expected: prints the frontmatter object with `title`, `description`, `datePublished`, `cluster: "students"`, `author: "SolomindLM"`, `relatedIntentPath: "/students/ai-flashcards"`, `keywords`, `navLabel`; body char count > 800.

- [ ] **Step 6: Commit**

```bash
git add apps/web/package.json apps/web/bun.lock biome.json apps/web/content/learn/how-to-turn-lecture-slides-into-flashcards.md
git commit -m "chore(learn): add markdown deps, seed post, biome ignore (#88)"
```

---

## Task 2: Content generator script

**Files:**
- Create: `apps/web/scripts/build-learn-content.ts`
- Create: `apps/web/src/features/landing/learnPosts.generated.json` (via running the script)

- [ ] **Step 1: Write the generator**

Create `apps/web/scripts/build-learn-content.ts`. It follows the existing `scripts/*.ts` conventions (bun shebang, `.ts` import extensions, relative imports into `../src`):

```ts
#!/usr/bin/env bun

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { marked, type Token, type Tokens } from "marked";
import { isClusterHubPath } from "../src/features/landing/clusterHubPages.ts";
import { isIntentLandingPath } from "../src/features/landing/intentLandingPages.ts";
import { isSeoContentPath } from "../src/features/landing/seoContentPages.ts";
import { SEO_BASE_URL, SEO_DEFAULT_OG_IMAGE } from "../src/shared/seo/seoConstants.ts";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, "..");
const contentDir = path.resolve(appDir, "content/learn");
const outPath = path.resolve(appDir, "src/features/landing/learnPosts.generated.json");

const CLUSTERS = ["students", "research"] as const;
type Cluster = (typeof CLUSTERS)[number];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type LearnPostHeading = { depth: 2 | 3; text: string; id: string };

type LearnPost = {
  slug: string;
  path: string;
  title: string;
  description: string;
  h1: string;
  navLabel: string;
  keywords?: string;
  datePublished: string;
  dateModified: string;
  author: string;
  cluster: Cluster;
  canonicalUrl: string;
  ogImage: string;
  relatedIntentPath?: string;
  bodyHtml: string;
  headings: LearnPostHeading[];
  readingTimeMinutes: number;
};

function fail(file: string, message: string): never {
  console.error(`[build-learn-content] ${path.basename(file)}: ${message}`);
  process.exit(1);
}

function requireString(file: string, data: Record<string, unknown>, key: string): string {
  const value = data[key];
  if (typeof value !== "string" || value.trim() === "") {
    fail(file, `frontmatter "${key}" is required and must be a non-empty string`);
  }
  return value.trim();
}

function optionalString(data: Record<string, unknown>, key: string): string | undefined {
  const value = data[key];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isKnownPath(candidate: string): boolean {
  return (
    isIntentLandingPath(candidate) || isClusterHubPath(candidate) || isSeoContentPath(candidate)
  );
}

function renderBody(file: string, raw: string): { bodyHtml: string; headings: LearnPostHeading[] } {
  const tokens = marked.lexer(raw);

  while (tokens.length > 0 && tokens[0]!.type === "space") {
    tokens.shift();
  }
  if (
    tokens.length > 0 &&
    tokens[0]!.type === "heading" &&
    (tokens[0] as Tokens.Heading).depth === 1
  ) {
    tokens.shift();
  }

  const headings: LearnPostHeading[] = [];
  for (const token of tokens as Token[]) {
    if (token.type !== "heading") continue;
    const depth = (token as Tokens.Heading).depth;
    if (depth !== 2 && depth !== 3) continue;
    const text = (token as Tokens.Heading).text.trim();
    headings.push({ depth, text, id: slugify(text) });
  }

  let html = marked.parser(tokens);

  const idQueue = headings.map((heading) => heading.id);
  html = html.replace(/<(h[23])>/g, (match, tag: string) => {
    const id = idQueue.shift();
    return id ? `<${tag} id="${id}">` : match;
  });

  html = html.trim();
  if (html === "") {
    fail(file, "post body is empty after rendering");
  }
  return { bodyHtml: html, headings };
}

function readingTimeMinutes(raw: string): number {
  const words = raw.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

function parsePost(file: string, data: Record<string, unknown>, content: string): LearnPost {
  const fileSlug = path.basename(file, ".md");
  if (!SLUG_RE.test(fileSlug)) {
    fail(file, `filename "${fileSlug}" must be a kebab-case slug (a-z, 0-9, dashes)`);
  }

  const title = requireString(file, data, "title");
  const description = requireString(file, data, "description");

  const datePublished = requireString(file, data, "datePublished");
  if (!DATE_RE.test(datePublished)) {
    fail(file, `"datePublished" must be YYYY-MM-DD (got "${datePublished}")`);
  }

  const clusterRaw = requireString(file, data, "cluster");
  if (!CLUSTERS.includes(clusterRaw as Cluster)) {
    fail(file, `"cluster" must be one of: ${CLUSTERS.join(", ")}`);
  }
  const cluster = clusterRaw as Cluster;

  const dateModified = optionalString(data, "dateModified") ?? datePublished;
  if (!DATE_RE.test(dateModified)) {
    fail(file, `"dateModified" must be YYYY-MM-DD (got "${dateModified}")`);
  }
  if (dateModified < datePublished) {
    fail(file, `"dateModified" (${dateModified}) is before "datePublished" (${datePublished})`);
  }

  const relatedIntentPath = optionalString(data, "relatedIntentPath");
  if (relatedIntentPath && !isKnownPath(relatedIntentPath)) {
    fail(file, `"relatedIntentPath" "${relatedIntentPath}" does not resolve to a known page`);
  }

  const slug = optionalString(data, "slug") ?? fileSlug;
  if (!SLUG_RE.test(slug)) {
    fail(file, `"slug" override "${slug}" must be kebab-case`);
  }
  const postPath = `/learn/${slug}`;

  const { bodyHtml, headings } = renderBody(file, content);

  return {
    slug,
    path: postPath,
    title,
    description,
    h1: optionalString(data, "h1") ?? title,
    navLabel: optionalString(data, "navLabel") ?? title,
    keywords: optionalString(data, "keywords"),
    datePublished,
    dateModified,
    author: optionalString(data, "author") ?? "SolomindLM",
    cluster,
    canonicalUrl: optionalString(data, "canonical") ?? `${SEO_BASE_URL}${postPath}`,
    ogImage: optionalString(data, "ogImage") ?? SEO_DEFAULT_OG_IMAGE,
    relatedIntentPath,
    bodyHtml,
    headings,
    readingTimeMinutes: readingTimeMinutes(content),
  };
}

function build(): string {
  if (!fs.existsSync(contentDir)) {
    console.error(`[build-learn-content] Missing ${contentDir}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(contentDir)
    .filter((name) => name.endsWith(".md"))
    .sort()
    .map((name) => path.join(contentDir, name));

  const posts: LearnPost[] = [];
  for (const file of files) {
    const parsed = matter(fs.readFileSync(file, "utf-8"));
    const data = parsed.data as Record<string, unknown>;
    if (data.draft === true) {
      console.log(`[build-learn-content] Skipping draft ${path.basename(file)}`);
      continue;
    }
    posts.push(parsePost(file, data, parsed.content));
  }

  const seen = new Set<string>();
  for (const post of posts) {
    if (seen.has(post.slug)) {
      console.error(`[build-learn-content] duplicate slug "${post.slug}"`);
      process.exit(1);
    }
    seen.add(post.slug);
  }

  posts.sort((a, b) =>
    a.datePublished === b.datePublished
      ? a.slug.localeCompare(b.slug)
      : b.datePublished.localeCompare(a.datePublished)
  );

  return `${JSON.stringify(posts, null, 2)}\n`;
}

const json = build();

if (process.argv.includes("--check")) {
  const existing = fs.existsSync(outPath) ? fs.readFileSync(outPath, "utf-8") : "";
  if (existing !== json) {
    console.error(
      "[build-learn-content] learnPosts.generated.json is stale — run `bun run learn:build` and commit."
    );
    process.exit(1);
  }
  console.log("[build-learn-content] generated JSON is up to date");
} else {
  fs.writeFileSync(outPath, json, "utf-8");
  const count = (JSON.parse(json) as unknown[]).length;
  console.log(`[build-learn-content] Wrote src/features/landing/learnPosts.generated.json (${count} post(s))`);
}
```

- [ ] **Step 2: Run the generator**

Run from `apps/web/`:

```bash
bun run learn:build
```

Expected: `[build-learn-content] Wrote src/features/landing/learnPosts.generated.json (1 post(s))`.

- [ ] **Step 3: Inspect the generated JSON**

```bash
bun -e 'const p=require("./src/features/landing/learnPosts.generated.json"); const e=p[0]; console.log(Object.keys(e).sort().join(",")); console.log("path:",e.path); console.log("cluster:",e.cluster); console.log("canonicalUrl:",e.canonicalUrl); console.log("headings:",e.headings.map(h=>h.depth+":"+h.id).join(" | ")); console.log("readingTimeMinutes:",e.readingTimeMinutes); console.log("bodyHtml starts:",e.bodyHtml.slice(0,60)); console.log("has h2 id:", /<h2 id="/.test(e.bodyHtml))'
```

Expected:
- keys: `author,bodyHtml,canonicalUrl,cluster,datePublished,dateModified,description,h1,headings,keywords,navLabel,ogImage,path,readingTimeMinutes,relatedIntentPath,slug,title`
- `path: /learn/how-to-turn-lecture-slides-into-flashcards`
- `cluster: students`
- `canonicalUrl: https://www.solomindlm.com/learn/how-to-turn-lecture-slides-into-flashcards`
- `headings` lists the five `h2` ids (`start-with-the-slide-deck-as-your-source`, …)
- `readingTimeMinutes` is a small positive integer
- `bodyHtml starts: <p>Lecture slides are dense…`
- `has h2 id: true`

- [ ] **Step 4: Run `--check` to confirm it is a no-op on the committed file**

```bash
bun run learn:check
```

Expected: `[build-learn-content] generated JSON is up to date` and exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/web/scripts/build-learn-content.ts apps/web/src/features/landing/learnPosts.generated.json
git commit -m "feat(learn): markdown → learnPosts.generated.json build step (#88)"
```

---

## Task 3: `learnPosts.ts` module + tests

**Files:**
- Create: `apps/web/src/features/landing/learnPosts.ts`
- Create: `apps/web/src/features/landing/learnPosts.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/features/landing/learnPosts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isClusterHubPath } from "./clusterHubPages";
import { isIntentLandingPath } from "./intentLandingPages";
import {
  getLearnBreadcrumbItems,
  getLearnClusterHub,
  getLearnPostBySlug,
  getLearnPostsByCluster,
  isLearnPath,
  LEARN_POSTS,
  slugFromLearnPath,
} from "./learnPosts";
import { isSeoContentPath } from "./seoContentPages";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SEED_SLUG = "how-to-turn-lecture-slides-into-flashcards";

describe("LEARN_POSTS", () => {
  it("contains the seed post with all required fields", () => {
    expect(LEARN_POSTS.length).toBeGreaterThan(0);
    const seed = getLearnPostBySlug(SEED_SLUG);
    expect(seed).toBeDefined();
    expect(seed!.path).toBe(`/learn/${SEED_SLUG}`);
    expect(seed!.cluster).toBe("students");
    expect(seed!.h1).toBeTruthy();
    expect(seed!.navLabel).toBeTruthy();
    expect(seed!.author).toBe("SolomindLM");
    expect(seed!.bodyHtml).toContain("<h2 id=");
  });

  it("has unique slugs and /learn/<slug> paths", () => {
    const slugs = LEARN_POSTS.map((post) => post.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const post of LEARN_POSTS) {
      expect(post.path).toBe(`/learn/${post.slug}`);
    }
  });

  it("has valid, ordered ISO dates", () => {
    for (const post of LEARN_POSTS) {
      expect(post.datePublished).toMatch(DATE_RE);
      expect(post.dateModified).toMatch(DATE_RE);
      expect(post.dateModified >= post.datePublished).toBe(true);
    }
  });

  it("only uses known clusters", () => {
    for (const post of LEARN_POSTS) {
      expect(["students", "research"]).toContain(post.cluster);
    }
  });

  it("every relatedIntentPath resolves to a known page", () => {
    for (const post of LEARN_POSTS) {
      if (!post.relatedIntentPath) continue;
      const known =
        isIntentLandingPath(post.relatedIntentPath) ||
        isClusterHubPath(post.relatedIntentPath) ||
        isSeoContentPath(post.relatedIntentPath);
      expect(known).toBe(true);
    }
  });
});

describe("learn helpers", () => {
  it("isLearnPath matches the index and posts, not unrelated paths", () => {
    expect(isLearnPath("/learn")).toBe(true);
    expect(isLearnPath(`/learn/${SEED_SLUG}`)).toBe(true);
    expect(isLearnPath("/learn/does-not-exist")).toBe(false);
    expect(isLearnPath("/students")).toBe(false);
  });

  it("slugFromLearnPath strips the prefix and trailing slash", () => {
    expect(slugFromLearnPath(`/learn/${SEED_SLUG}`)).toBe(SEED_SLUG);
    expect(slugFromLearnPath(`/learn/${SEED_SLUG}/`)).toBe(SEED_SLUG);
  });

  it("getLearnPostsByCluster filters by cluster", () => {
    const students = getLearnPostsByCluster("students");
    expect(students.some((post) => post.slug === SEED_SLUG)).toBe(true);
    expect(students.every((post) => post.cluster === "students")).toBe(true);
  });

  it("getLearnBreadcrumbItems is Home → Learn → navLabel", () => {
    const seed = getLearnPostBySlug(SEED_SLUG)!;
    expect(getLearnBreadcrumbItems(seed)).toEqual([
      { name: "Home", path: "/" },
      { name: "Learn", path: "/learn" },
      { name: seed.navLabel, path: seed.path },
    ]);
  });

  it("getLearnClusterHub returns the hub path and label", () => {
    expect(getLearnClusterHub("students")).toEqual({ path: "/students", label: "Students" });
    expect(getLearnClusterHub("research")).toEqual({ path: "/research", label: "Research" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `apps/web/`:

```bash
bun run test -- learnPosts
```

Expected: FAIL — `Cannot find module './learnPosts'` (or unresolved exports).

- [ ] **Step 3: Write `learnPosts.ts`**

Create `apps/web/src/features/landing/learnPosts.ts`:

```ts
import { CLUSTER_HUB_LABELS, CLUSTER_HUB_PATHS } from "./intentLandingPages";
import learnPostsData from "./learnPosts.generated.json";

export type LearnCluster = "students" | "research";

export type LearnPostHeading = { depth: 2 | 3; text: string; id: string };

export type LearnPost = {
  slug: string;
  path: string;
  title: string;
  description: string;
  h1: string;
  navLabel: string;
  keywords?: string;
  datePublished: string;
  dateModified: string;
  author: string;
  cluster: LearnCluster;
  canonicalUrl: string;
  ogImage: string;
  relatedIntentPath?: string;
  bodyHtml: string;
  headings: LearnPostHeading[];
  readingTimeMinutes: number;
};

/** Generated at build time by `scripts/build-learn-content.ts` from `content/learn/*.md`. */
export const LEARN_POSTS = learnPostsData as unknown as LearnPost[];

export const LEARN_INDEX_PATH = "/learn";

export const LEARN_CLUSTER_ORDER: LearnCluster[] = ["students", "research"];

function normalizePath(path: string): string {
  if (path === "") return "/";
  return path.startsWith("/") ? path : `/${path}`;
}

export function getLearnPostBySlug(slug: string): LearnPost | undefined {
  return LEARN_POSTS.find((post) => post.slug === slug);
}

export function getLearnPostByPath(path: string): LearnPost | undefined {
  const normalized = normalizePath(path);
  return LEARN_POSTS.find((post) => post.path === normalized);
}

export function getLearnPaths(): string[] {
  return LEARN_POSTS.map((post) => post.path);
}

export function isLearnPath(path: string): boolean {
  const normalized = normalizePath(path);
  return normalized === LEARN_INDEX_PATH || getLearnPostByPath(normalized) !== undefined;
}

export function slugFromLearnPath(path: string): string {
  return normalizePath(path).replace(/^\/learn\//, "").replace(/\/$/, "");
}

export function getLearnPostsByCluster(cluster: LearnCluster): LearnPost[] {
  return LEARN_POSTS.filter((post) => post.cluster === cluster);
}

export type LearnBreadcrumbItem = { name: string; path: string };

export function getLearnBreadcrumbItems(post: LearnPost): LearnBreadcrumbItem[] {
  return [
    { name: "Home", path: "/" },
    { name: "Learn", path: LEARN_INDEX_PATH },
    { name: post.navLabel, path: post.path },
  ];
}

export function getLearnClusterHub(cluster: LearnCluster): { path: string; label: string } {
  return { path: CLUSTER_HUB_PATHS[cluster], label: CLUSTER_HUB_LABELS[cluster] };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
bun run test -- learnPosts
```

Expected: PASS (all cases in `learnPosts.test.ts`).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/landing/learnPosts.ts apps/web/src/features/landing/learnPosts.test.ts
git commit -m "feat(learn): typed learnPosts registry + helpers (#88)"
```

---

## Task 4: `author` param on `generateArticleStructuredData`

**Files:**
- Modify: `apps/web/src/shared/seo/structuredData.ts:59-97`
- Test: `apps/web/src/shared/seo/structuredData.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `apps/web/src/shared/seo/structuredData.test.ts` inside the existing `describe("generateArticleStructuredData", …)` block:

```ts
  it("emits an Organization author by default", () => {
    const data = generateArticleStructuredData({
      headline: "Example",
      description: "Example description",
      path: "/learn/example",
      datePublished: "2026-09-09",
      dateModified: "2026-09-09",
    });
    expect(data.author).toMatchObject({ "@type": "Organization", name: "SolomindLM" });
  });

  it("emits an Organization author when author is 'SolomindLM'", () => {
    const data = generateArticleStructuredData({
      headline: "Example",
      description: "Example description",
      path: "/learn/example",
      datePublished: "2026-09-09",
      dateModified: "2026-09-09",
      author: "SolomindLM",
    });
    expect(data.author).toMatchObject({ "@type": "Organization" });
  });

  it("emits a Person author when a named author is provided", () => {
    const data = generateArticleStructuredData({
      headline: "Example",
      description: "Example description",
      path: "/learn/example",
      datePublished: "2026-09-09",
      dateModified: "2026-09-09",
      author: "Jane Doe",
    });
    expect(data.author).toEqual({ "@type": "Person", name: "Jane Doe" });
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `apps/web/`:

```bash
bun run test -- structuredData
```

Expected: FAIL — the "Person author" case fails (`author` is still the hardcoded Organization).

- [ ] **Step 3: Implement**

In `apps/web/src/shared/seo/structuredData.ts`, extend `ArticleStructuredDataParams` and the function:

```ts
export type ArticleStructuredDataParams = {
  headline: string;
  description: string;
  path: string;
  datePublished: string;
  dateModified: string;
  articleType?: "Article" | "TechArticle";
  /** Named author → schema.org Person; omitted or "SolomindLM" → the default Organization author. */
  author?: string;
};

export const generateArticleStructuredData = ({
  headline,
  description,
  path,
  datePublished,
  dateModified,
  articleType = "Article",
  author,
}: ArticleStructuredDataParams) => ({
  "@context": "https://schema.org",
  "@type": articleType,
  headline,
  description,
  url: `${SEO_BASE_URL}${path}`,
  datePublished,
  dateModified,
  author:
    author && author !== "SolomindLM"
      ? { "@type": "Person", name: author }
      : {
          "@type": "Organization",
          name: "SolomindLM",
          url: SEO_BASE_URL,
        },
  publisher: {
    "@type": "Organization",
    name: "SolomindLM",
    logo: {
      "@type": "ImageObject",
      url: SEO_DEFAULT_OG_IMAGE,
    },
  },
  mainEntityOfPage: `${SEO_BASE_URL}${path}`,
});
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
bun run test -- structuredData
```

Expected: PASS (all cases, including the pre-existing ones).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/shared/seo/structuredData.ts apps/web/src/shared/seo/structuredData.test.ts
git commit -m "feat(seo): optional Person author on Article structured data (#88)"
```

---

## Task 5: Absolute canonical override

**Files:**
- Modify: `apps/web/src/shared/seo/seoHtml.ts:4-15,24-37,95-105`
- Modify: `apps/web/src/shared/seo/publicSeoPages.ts:28-45`
- Modify: `apps/web/src/shared/seo/SEOMeta.tsx`
- Modify: `apps/web/scripts/generate-sitemap.ts:16-20`
- Test: `apps/web/src/shared/seo/seoHtml.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `apps/web/src/shared/seo/seoHtml.test.ts` inside `describe("applySeoToHtml", …)`:

```ts
  it("prefers an absolute canonicalUrl over the derived path", () => {
    const html = applySeoToHtml(MINIMAL_HTML, SEO_BASE_URL, {
      title: "T",
      description: "D",
      canonicalPath: "/learn/example",
      canonicalUrl: "https://example.org/syndicated",
      robots: "index, follow",
    });
    expect(html).toContain('rel="canonical" href="https://example.org/syndicated"');
    expect(html).toContain('property="og:url" content="https://example.org/syndicated"');
  });

  it("falls back to the derived canonical when canonicalUrl is absent", () => {
    const html = applySeoToHtml(MINIMAL_HTML, SEO_BASE_URL, {
      title: "T",
      description: "D",
      canonicalPath: "/learn/example",
      robots: "index, follow",
    });
    expect(html).toContain(`rel="canonical" href="${SEO_BASE_URL}/learn/example"`);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `apps/web/`:

```bash
bun run test -- seoHtml
```

Expected: FAIL — `canonicalUrl` is not a known property of the head input / not honored.

- [ ] **Step 3: Implement in `seoHtml.ts`**

Add the field to `SeoHeadInput`:

```ts
export type SeoHeadInput = {
  title: string;
  description: string;
  canonicalPath: string;
  /** Absolute canonical URL override; when set, used verbatim instead of baseUrl + canonicalPath. */
  canonicalUrl?: string;
  keywords?: string;
  ogType?: "website" | "article";
  ogImage?: string;
  ogImageAlt?: string;
  twitterCard?: "summary" | "summary_large_image";
  robots: string;
  structuredData?: Record<string, unknown> | Record<string, unknown>[];
};
```

Pass it through in `seoPageToHeadInput`:

```ts
export function seoPageToHeadInput(page: PublicSeoPage): SeoHeadInput {
  return {
    title: page.title,
    description: page.description,
    canonicalPath: page.path,
    canonicalUrl: page.canonicalUrl,
    keywords: page.keywords,
    ogType: page.ogType ?? "website",
    ogImage: page.ogImage,
    ogImageAlt: page.ogImageAlt,
    twitterCard: page.twitterCard ?? "summary_large_image",
    robots: page.noindex ? "noindex, nofollow" : "index, follow",
    structuredData: page.structuredData,
  };
}
```

In `applySeoToHtml`, change the first line of the body (currently `const url = canonicalUrl(baseUrl, seo.canonicalPath);`):

```ts
  const url = seo.canonicalUrl ?? canonicalUrl(baseUrl, seo.canonicalPath);
```

- [ ] **Step 4: Implement in `publicSeoPages.ts`**

Add the field to the `PublicSeoPage` type (after `path`):

```ts
export type PublicSeoPage = {
  /** Canonical path, e.g. `/` or `/privacy` */
  path: string;
  /** Absolute canonical URL override; defaults to SEO_BASE_URL + path. */
  canonicalUrl?: string;
  title: string;
  description: string;
  // …unchanged…
```

- [ ] **Step 5: Implement in `generate-sitemap.ts`**

Change the `loc` line (currently `const loc = canonicalUrl(SEO_BASE_URL, page.path);`):

```ts
      const loc = page.canonicalUrl ?? canonicalUrl(SEO_BASE_URL, page.path);
```

- [ ] **Step 6: Implement in `SEOMeta.tsx`**

Add a module-scope helper below the imports:

```ts
function resolveCanonicalHref(value: string): string {
  return /^https?:\/\//.test(value) ? value : canonicalUrl(SEO_BASE_URL, value);
}
```

Change the canonical derivation (line ~26) to also consider the registry override:

```ts
  const canonical = props.canonical ?? registryPage?.canonicalUrl ?? registryPage?.path;
```

Replace the `pageUrl` computation:

```ts
    const pageUrl = canonical
      ? resolveCanonicalHref(canonical)
      : typeof window !== "undefined"
        ? window.location.href
        : SEO_BASE_URL;
```

Replace the canonical `<link>` write:

```ts
    if (canonical) {
      setLinkTag("canonical", resolveCanonicalHref(canonical));
    }
```

- [ ] **Step 7: Run the tests**

```bash
bun run test -- seoHtml
```

Expected: PASS (new cases + all pre-existing `seoHtml` cases).

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/shared/seo/seoHtml.ts apps/web/src/shared/seo/seoHtml.test.ts apps/web/src/shared/seo/publicSeoPages.ts apps/web/src/shared/seo/SEOMeta.tsx apps/web/scripts/generate-sitemap.ts
git commit -m "feat(seo): absolute canonical URL override on public SEO pages (#88)"
```

---

## Task 6: `/learn` prerender bodies

**Files:**
- Create: `apps/web/src/shared/seo/learnPrerenderHtml.ts`
- Create: `apps/web/src/shared/seo/learnPrerenderHtml.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/shared/seo/learnPrerenderHtml.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getLearnPostBySlug, LEARN_POSTS } from "@/features/landing/learnPosts";
import { buildLearnIndexPrerenderBody, buildLearnPostPrerenderBody } from "./learnPrerenderHtml";

const SEED_SLUG = "how-to-turn-lecture-slides-into-flashcards";

describe("buildLearnPostPrerenderBody", () => {
  const seed = getLearnPostBySlug(SEED_SLUG)!;
  const html = buildLearnPostPrerenderBody(seed);

  it("wraps the crawlable article marker", () => {
    expect(html).toContain('data-seo-prerender="true"');
    expect(html).toContain('id="seo-prerender-content"');
  });

  it("renders the h1 and a byline with author and dates", () => {
    expect(html).toContain(`<h1>${seed.h1}</h1>`);
    expect(html).toContain(`By ${seed.author}`);
    expect(html).toContain(seed.datePublished);
  });

  it("includes a breadcrumb up to /learn", () => {
    expect(html).toContain('<a href="/learn">Learn</a>');
  });

  it("inlines the rendered body and a body heading", () => {
    expect(html).toContain("<h2 id=");
    expect(html).toContain("Start with the slide deck as your source");
  });

  it("links to the cluster hub and the related intent page", () => {
    expect(html).toContain('href="/students"');
    expect(html).toContain(`href="${seed.relatedIntentPath}"`);
  });
});

describe("buildLearnIndexPrerenderBody", () => {
  const html = buildLearnIndexPrerenderBody();

  it("lists the seed post under a students section", () => {
    expect(html).toContain("For students");
    expect(html).toContain(`href="/learn/${SEED_SLUG}"`);
  });

  it("omits an empty research section when no research posts exist", () => {
    const hasResearchPosts = LEARN_POSTS.some((post) => post.cluster === "research");
    if (!hasResearchPosts) {
      expect(html).not.toContain("For researchers");
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run from `apps/web/`:

```bash
bun run test -- learnPrerenderHtml
```

Expected: FAIL — `Cannot find module './learnPrerenderHtml'`.

- [ ] **Step 3: Implement**

Create `apps/web/src/shared/seo/learnPrerenderHtml.ts`. It mirrors `seoContentPrerenderHtml.ts` and re-uses `escapeHtml`. Note `bodyHtml` is inserted verbatim (already HTML, first-party — see spec "Trusted-content assumption"):

```ts
import {
  getLearnBreadcrumbItems,
  getLearnClusterHub,
  getLearnPostsByCluster,
  LEARN_CLUSTER_ORDER,
  type LearnPost,
} from "@/features/landing/learnPosts";
import { escapeHtml } from "./seoHtml";

const CLUSTER_HEADINGS: Record<LearnPost["cluster"], string> = {
  students: "For students",
  research: "For researchers",
};

function bylineText(post: LearnPost): string {
  const parts = [`By ${post.author}`, `Published ${post.datePublished}`];
  if (post.dateModified !== post.datePublished) {
    parts.push(`Updated ${post.dateModified}`);
  }
  parts.push(`${post.readingTimeMinutes} min read`);
  return parts.join(" · ");
}

/** Static HTML body for crawlers — injected at build time into prerendered index.html. */
export function buildLearnPostPrerenderBody(post: LearnPost): string {
  const breadcrumbItems = getLearnBreadcrumbItems(post);
  const breadcrumbNav = breadcrumbItems
    .map((item, index) => {
      const isLast = index === breadcrumbItems.length - 1;
      const label = escapeHtml(item.name);
      return isLast
        ? `          <li>${label}</li>`
        : `          <li><a href="${escapeHtml(item.path)}">${label}</a></li>`;
    })
    .join("\n");

  const hub = getLearnClusterHub(post.cluster);
  const relatedLinks = [
    `          <li><a href="${escapeHtml(hub.path)}">${escapeHtml(hub.label)} hub</a></li>`,
    post.relatedIntentPath
      ? `          <li><a href="${escapeHtml(post.relatedIntentPath)}">Related feature</a></li>`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return `    <article data-seo-prerender="true" id="seo-prerender-content">
      <nav aria-label="Breadcrumb">
        <ol>
${breadcrumbNav}
        </ol>
      </nav>
      <header>
        <h1>${escapeHtml(post.h1)}</h1>
        <p>${escapeHtml(bylineText(post))}</p>
      </header>
      <div>
${post.bodyHtml}
      </div>
      <section aria-labelledby="seo-prerender-related">
        <h2 id="seo-prerender-related">Keep going</h2>
        <ul>
${relatedLinks}
        </ul>
      </section>
      <footer>
        <p><a href="/learn">All guides</a> · <a href="/">SolomindLM home</a></p>
      </footer>
    </article>`;
}

export function buildLearnIndexPrerenderBody(): string {
  const sections = LEARN_CLUSTER_ORDER.map((cluster) => {
    const posts = getLearnPostsByCluster(cluster);
    if (posts.length === 0) return "";
    const items = posts
      .map(
        (post) =>
          `          <li><a href="${escapeHtml(post.path)}">${escapeHtml(post.navLabel)}</a> — ${escapeHtml(post.description)}</li>`
      )
      .join("\n");
    return `      <section>
        <h2>${escapeHtml(CLUSTER_HEADINGS[cluster])}</h2>
        <ul>
${items}
        </ul>
      </section>`;
  })
    .filter(Boolean)
    .join("\n");

  return `    <article data-seo-prerender="true" id="seo-prerender-content">
      <header>
        <h1>Learn</h1>
        <p>Guides on studying from your own materials and running AI-assisted research with SolomindLM.</p>
      </header>
${sections}
      <footer>
        <p><a href="/">SolomindLM home</a></p>
      </footer>
    </article>`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
bun run test -- learnPrerenderHtml
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/shared/seo/learnPrerenderHtml.ts apps/web/src/shared/seo/learnPrerenderHtml.test.ts
git commit -m "feat(learn): crawlable prerender bodies for posts and index (#88)"
```

---

## Task 7: Wire `/learn` into the public SEO registry + prerender dispatcher

**Files:**
- Modify: `apps/web/src/shared/seo/publicSeoPages.ts:1-26,64-144`
- Modify: `apps/web/src/shared/seo/publicSeoPrerenderHtml.ts:1-11,61-91`
- Test: `apps/web/src/shared/seo/seoHtml.test.ts`

- [ ] **Step 1: Write the failing tests (the `<head>` smoke test from the acceptance criteria)**

Append to `apps/web/src/shared/seo/seoHtml.test.ts` a new `describe` block:

```ts
describe("learn posts in the public SEO registry", () => {
  const SEED_PATH = "/learn/how-to-turn-lecture-slides-into-flashcards";

  it("registers the seed post with article OG type and an absolute canonical", () => {
    const page = getPublicSeoPageByPath(SEED_PATH);
    expect(page).toBeDefined();
    expect(page!.ogType).toBe("article");
    expect(page!.canonicalUrl).toBe(`${SEO_BASE_URL}${SEED_PATH}`);
  });

  it("emits a correct <head> for the seed post", () => {
    const page = getPublicSeoPageByPath(SEED_PATH)!;
    const html = applySeoToHtml(MINIMAL_HTML, SEO_BASE_URL, seoPageToHeadInput(page));

    expect(html).toContain("<title>How to Turn Lecture Slides Into Flashcards With AI</title>");
    expect(html).toContain('name="description" content="A repeatable workflow');
    expect(html).toContain(`rel="canonical" href="${SEO_BASE_URL}${SEED_PATH}"`);
    expect(html).toContain('property="og:type" content="article"');
  });

  it("emits Article JSON-LD with datePublished and dateModified from frontmatter", () => {
    const page = getPublicSeoPageByPath(SEED_PATH)!;
    const html = applySeoToHtml(MINIMAL_HTML, SEO_BASE_URL, seoPageToHeadInput(page));

    expect(html).toContain('"@type":"Article"');
    expect(html).toContain('"datePublished":"2026-09-09"');
    expect(html).toContain('"dateModified":"2026-09-09"');
  });

  it("registers the /learn index page", () => {
    const page = getPublicSeoPageByPath("/learn");
    expect(page).toBeDefined();
    expect(page!.title).toContain("Learn");
    const html = applySeoToHtml(MINIMAL_HTML, SEO_BASE_URL, seoPageToHeadInput(page!));
    expect(html).toContain(`rel="canonical" href="${SEO_BASE_URL}/learn"`);
    expect(html).toContain('"@type":"BreadcrumbList"');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run from `apps/web/`:

```bash
bun run test -- seoHtml
```

Expected: FAIL — `getPublicSeoPageByPath("/learn/…")` returns `undefined`.

- [ ] **Step 3: Implement in `publicSeoPages.ts`**

Add imports near the other landing imports (top of file):

```ts
import {
  getLearnBreadcrumbItems,
  LEARN_INDEX_PATH,
  LEARN_POSTS,
} from "@/features/landing/learnPosts";
```

Add the two mappers after `SEO_CONTENT_SEO_PAGES` (around line 85):

```ts
const LEARN_SEO_PAGES: PublicSeoPage[] = LEARN_POSTS.map((post) => ({
  path: post.path,
  canonicalUrl: post.canonicalUrl,
  title: post.title,
  description: post.description,
  keywords: post.keywords,
  ogType: "article",
  ogImage: post.ogImage,
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
  path: LEARN_INDEX_PATH,
  title: "Learn — study & research guides | SolomindLM",
  description:
    "Guides on studying from your own materials and running AI-assisted research with SolomindLM.",
  keywords: "ai study guides, ai research guides, how to study with ai",
  changefreq: "weekly",
  priority: 0.6,
  structuredData: [
    generateBreadcrumbStructuredData([
      { name: "Home", path: "/" },
      { name: "Learn", path: LEARN_INDEX_PATH },
    ]),
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "Learn — SolomindLM guides",
      url: `${SEO_BASE_URL}${LEARN_INDEX_PATH}`,
      hasPart: LEARN_POSTS.map((post) => ({
        "@type": "Article",
        headline: post.h1,
        url: `${SEO_BASE_URL}${post.path}`,
        datePublished: post.datePublished,
        dateModified: post.dateModified,
      })),
    },
  ],
};
```

`SEO_BASE_URL` is already imported in this file. Extend the `PUBLIC_SEO_PAGES` array tail (currently ends `…, ...SEO_CONTENT_SEO_PAGES];`):

```ts
  ...CLUSTER_HUB_SEO_PAGES,
  ...INTENT_SEO_PAGES,
  ...SEO_CONTENT_SEO_PAGES,
  LEARN_INDEX_SEO_PAGE,
  ...LEARN_SEO_PAGES,
];
```

- [ ] **Step 4: Implement in `publicSeoPrerenderHtml.ts`**

Add imports:

```ts
import { getLearnPostBySlug, LEARN_INDEX_PATH, slugFromLearnPath } from "@/features/landing/learnPosts";
import { buildLearnIndexPrerenderBody, buildLearnPostPrerenderBody } from "./learnPrerenderHtml";
```

In `buildPublicSeoPrerenderBody`, add these checks before the final `return undefined;` (after the `getSeoContentPageByPath` block):

```ts
  if (path === LEARN_INDEX_PATH) {
    return buildLearnIndexPrerenderBody();
  }

  const learnPost = getLearnPostBySlug(slugFromLearnPath(path));
  if (learnPost) {
    return buildLearnPostPrerenderBody(learnPost);
  }
```

- [ ] **Step 5: Run the tests**

```bash
bun run test -- seoHtml
```

Expected: PASS (new `describe` block + all pre-existing cases).

- [ ] **Step 6: Verify the prerender + sitemap scripts pick the pages up**

Run from `apps/web/`:

```bash
bun -e 'const { getIndexablePublicSeoPages } = await import("./src/shared/seo/publicSeoPages.ts"); const paths = getIndexablePublicSeoPages().map(p => p.path).filter(p => p.startsWith("/learn")); console.log(paths)'
bun -e 'const { buildPublicSeoPrerenderBody } = await import("./src/shared/seo/publicSeoPrerenderHtml.ts"); console.log("index body has For students:", buildPublicSeoPrerenderBody("/learn").includes("For students")); console.log("post body has h1:", buildPublicSeoPrerenderBody("/learn/how-to-turn-lecture-slides-into-flashcards").includes("<h1>"))'
```

Expected: first prints `[ "/learn", "/learn/how-to-turn-lecture-slides-into-flashcards" ]`; second prints both `true`.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/shared/seo/publicSeoPages.ts apps/web/src/shared/seo/publicSeoPrerenderHtml.ts apps/web/src/shared/seo/seoHtml.test.ts
git commit -m "feat(learn): register /learn posts + index in the public SEO pipeline (#88)"
```

---

## Task 8: React route components + `App.tsx` wiring

**Files:**
- Create: `apps/web/src/features/landing/LearnPostPage.tsx`
- Create: `apps/web/src/features/landing/LearnIndexPage.tsx`
- Modify: `apps/web/src/App.tsx:20-27,162-170,420-426`

- [ ] **Step 1: Create `LearnPostPage.tsx`**

Mirrors `SeoContentPage.tsx` (header pattern, `isNativeShell` redirect, `SEOMeta` with `pagePath` so the registry supplies structured data). The rendered Markdown uses the repo's hand-rolled `.prose` styles from `src/index.css`:

```tsx
import { ChevronRight } from "lucide-react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/features/auth/useAuth";
import { SEOMeta } from "@/shared/seo/SEOMeta";
import { isNativeShell } from "@/utils/platformDetection";
import { Footer } from "./components/Footer";
import { getLearnClusterHub, getLearnPostBySlug } from "./learnPosts";

export function LearnPostPage({ slug }: { slug: string }) {
  const post = getLearnPostBySlug(slug);
  const { isAuthenticated, isLoading } = useAuth();

  if (!post) {
    return <Navigate to="/learn" replace />;
  }

  if (isNativeShell()) {
    if (isLoading) {
      return <div className="min-h-screen bg-background" />;
    }
    return <Navigate to={isAuthenticated ? "/home" : "/sign-in"} replace />;
  }

  const hub = getLearnClusterHub(post.cluster);
  const bylineParts = [
    `By ${post.author}`,
    `Published ${post.datePublished}`,
    ...(post.dateModified !== post.datePublished ? [`Updated ${post.dateModified}`] : []),
    `${post.readingTimeMinutes} min read`,
  ];

  return (
    <>
      <SEOMeta
        pagePath={post.path}
        title={post.title}
        description={post.description}
        keywords={post.keywords}
        ogType="article"
      />
      <div className="min-h-screen landing-grid-pattern">
        <LearnHeader />
        <section className="px-6 md:px-8 pt-16 pb-10 md:pt-24 md:pb-12">
          <div className="max-w-3xl mx-auto space-y-6">
            <nav aria-label="Breadcrumb" className="flex justify-center">
              <ol className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                <li>
                  <Link to="/" className="hover:text-foreground transition-colors">
                    Home
                  </Link>
                </li>
                <li aria-hidden className="text-border">
                  /
                </li>
                <li>
                  <Link to="/learn" className="hover:text-foreground transition-colors">
                    Learn
                  </Link>
                </li>
                <li aria-hidden className="text-border">
                  /
                </li>
                <li className="font-medium text-foreground">{post.navLabel}</li>
              </ol>
            </nav>
            <h1 className="text-4xl md:text-5xl font-display font-bold text-foreground tracking-tight leading-tight text-center">
              {post.h1}
            </h1>
            <p className="text-sm text-muted-foreground text-center">{bylineParts.join(" · ")}</p>
          </div>
        </section>
        <div className="px-6 md:px-8 pb-16 md:pb-20">
          <div
            className="prose max-w-3xl mx-auto font-serif"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: first-party Markdown compiled at build time by scripts/build-learn-content.ts
            dangerouslySetInnerHTML={{ __html: post.bodyHtml }}
          />
        </div>
        <section className="px-6 md:px-8 py-16 md:py-20 border-t border-border/60 bg-card/30">
          <div className="max-w-5xl mx-auto space-y-8">
            <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground text-center">
              Keep going
            </h2>
            <ul className="grid gap-4 sm:grid-cols-2 max-w-3xl mx-auto">
              <li>
                <Link
                  to={hub.path}
                  className="group flex flex-col h-full rounded-xl border border-border bg-card p-5 hover:border-primary/40 hover:shadow-sm transition-all"
                >
                  <span className="font-medium text-foreground group-hover:text-primary transition-colors">
                    {hub.label} hub
                  </span>
                  <span className="mt-2 text-sm text-muted-foreground leading-relaxed flex-1">
                    Browse every {hub.label.toLowerCase()} workflow in one place.
                  </span>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
                    Learn more
                    <ChevronRight className="w-4 h-4" aria-hidden />
                  </span>
                </Link>
              </li>
              {post.relatedIntentPath ? (
                <li>
                  <Link
                    to={post.relatedIntentPath}
                    className="group flex flex-col h-full rounded-xl border border-border bg-card p-5 hover:border-primary/40 hover:shadow-sm transition-all"
                  >
                    <span className="font-medium text-foreground group-hover:text-primary transition-colors">
                      Related feature
                    </span>
                    <span className="mt-2 text-sm text-muted-foreground leading-relaxed flex-1">
                      See the product page for the workflow this guide covers.
                    </span>
                    <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
                      Learn more
                      <ChevronRight className="w-4 h-4" aria-hidden />
                    </span>
                  </Link>
                </li>
              ) : null}
            </ul>
          </div>
        </section>
        <Footer />
      </div>
    </>
  );
}

function LearnHeader() {
  return (
    <header className="border-b border-border/60 bg-card/40 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-[1500px] mx-auto px-6 sm:px-8 lg:px-12 h-16 flex items-center justify-between">
        <Link to="/" className="inline-flex items-center gap-2.5">
          <img
            src="/SolomindLM_logo.png"
            alt="SolomindLM"
            className="w-8 h-8 shrink-0 object-contain"
          />
          <span className="text-lg font-display font-bold text-foreground tracking-tight">
            SolomindLM
          </span>
        </Link>
        <Link
          to="/learn"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          All guides
        </Link>
      </div>
    </header>
  );
}
```

> If `bun run lint` reports that `lint/security/noDangerouslySetInnerHtml` is not an enabled rule, delete the `biome-ignore` comment (Biome runs with `recommended: false` and that rule is not in `biome.json`, so the comment may be flagged as unused — remove it if so).

- [ ] **Step 2: Create `LearnIndexPage.tsx`**

```tsx
import { Link } from "react-router-dom";
import { SEOMeta } from "@/shared/seo/SEOMeta";
import { Footer } from "./components/Footer";
import {
  getLearnClusterHub,
  getLearnPostsByCluster,
  LEARN_CLUSTER_ORDER,
  type LearnCluster,
} from "./learnPosts";

const CLUSTER_HEADINGS: Record<LearnCluster, string> = {
  students: "For students",
  research: "For researchers",
};

export function LearnIndexPage() {
  const clusters = LEARN_CLUSTER_ORDER.map((cluster) => ({
    cluster,
    posts: getLearnPostsByCluster(cluster),
  })).filter((group) => group.posts.length > 0);

  return (
    <>
      <SEOMeta pagePath="/learn" />
      <div className="min-h-screen landing-grid-pattern">
        <header className="border-b border-border/60 bg-card/40 backdrop-blur-sm sticky top-0 z-50">
          <div className="max-w-[1500px] mx-auto px-6 sm:px-8 lg:px-12 h-16 flex items-center justify-between">
            <Link to="/" className="inline-flex items-center gap-2.5">
              <img
                src="/SolomindLM_logo.png"
                alt="SolomindLM"
                className="w-8 h-8 shrink-0 object-contain"
              />
              <span className="text-lg font-display font-bold text-foreground tracking-tight">
                SolomindLM
              </span>
            </Link>
            <Link
              to="/"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Back to home
            </Link>
          </div>
        </header>

        <section className="px-6 md:px-8 pt-16 pb-12 md:pt-24 md:pb-16">
          <div className="max-w-3xl mx-auto space-y-5 text-center">
            <h1 className="text-4xl md:text-5xl font-display font-bold text-foreground tracking-tight">
              Learn
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Guides on studying from your own materials and running AI-assisted research with
              SolomindLM.
            </p>
          </div>
        </section>

        <div className="px-6 md:px-8 pb-20">
          <div className="max-w-5xl mx-auto space-y-16">
            {clusters.map(({ cluster, posts }) => {
              const hub = getLearnClusterHub(cluster);
              return (
                <section key={cluster} className="space-y-6">
                  <div className="flex items-baseline justify-between gap-4">
                    <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground">
                      {CLUSTER_HEADINGS[cluster]}
                    </h2>
                    <Link
                      to={hub.path}
                      className="text-sm font-medium text-primary hover:opacity-80 transition-opacity"
                    >
                      {hub.label} hub →
                    </Link>
                  </div>
                  <ul className="grid gap-4 sm:grid-cols-2">
                    {posts.map((post) => (
                      <li key={post.slug}>
                        <Link
                          to={post.path}
                          className="group flex flex-col h-full rounded-xl border border-border bg-card p-5 hover:border-primary/40 hover:shadow-sm transition-all"
                        >
                          <span className="font-medium text-foreground group-hover:text-primary transition-colors">
                            {post.navLabel}
                          </span>
                          <span className="mt-2 text-sm text-muted-foreground leading-relaxed flex-1">
                            {post.description}
                          </span>
                          <span className="mt-4 text-xs text-muted-foreground">
                            {post.dateModified !== post.datePublished
                              ? `Updated ${post.dateModified}`
                              : `Published ${post.datePublished}`}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>

        <Footer />
      </div>
    </>
  );
}
```

- [ ] **Step 3: Wire routes in `App.tsx`**

Add imports next to the other landing imports (near line 26):

```ts
import { LearnIndexPage } from "./features/landing/LearnIndexPage";
import { LearnPostPage } from "./features/landing/LearnPostPage";
import { isLearnPath, LEARN_POSTS } from "./features/landing/learnPosts";
```

Add `isLearnPath` to the `isPublicPage` expression (around line 162-170), after `isSeoContentPath(location.pathname)`:

```ts
    isSeoContentPath(location.pathname) ||
    isLearnPath(location.pathname);
```

Add the routes right after the `SEO_CONTENT_PAGES.map(...)` block (after line 426, before `<Route path="/home" …>`):

```tsx
            <Route path="/learn" element={<LearnIndexPage />} />

            {LEARN_POSTS.map((post) => (
              <Route
                key={post.path}
                path={post.path}
                element={<LearnPostPage slug={post.slug} />}
              />
            ))}
```

- [ ] **Step 4: Typecheck**

Run from repo root (`.claude/worktrees/issue-88-seo-7d2dd4/`):

```bash
bun run typecheck:web
```

Expected: no errors.

- [ ] **Step 5: Manual smoke in the dev server (optional but recommended)**

Run from `apps/web/`:

```bash
bun run dev
```

Visit `http://localhost:5173/learn` and `http://localhost:5173/learn/how-to-turn-lecture-slides-into-flashcards`. Expected: index lists the seed post under "For students"; the post renders the styled article with breadcrumb, byline, headings, and the two "Keep going" cards. Stop the server when done.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/landing/LearnPostPage.tsx apps/web/src/features/landing/LearnIndexPage.tsx apps/web/src/App.tsx
git commit -m "feat(learn): /learn index and post route components (#88)"
```

---

## Task 9: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Regenerate content and confirm no drift**

Run from `apps/web/`:

```bash
bun run learn:build && git diff --stat
```

Expected: no change to `learnPosts.generated.json` (it was committed current in Task 2 / 7).

- [ ] **Step 2: Typechecks (run separately — cannot parallelize)**

Run from repo root:

```bash
bun run typecheck:web
bun run typecheck:convex
```

Expected: both pass with no errors.

- [ ] **Step 3: Lint**

```bash
bun run lint
```

Expected: no errors. If Biome flags the `biome-ignore` comment in `LearnPostPage.tsx` as unused, remove that comment line and re-run.

- [ ] **Step 4: Web tests**

```bash
bun run test:web
```

Expected: all pass, including `learnPosts`, `learnPrerenderHtml`, `structuredData`, `seoHtml`, `seoContentPages`.

- [ ] **Step 5: Convex tests (per CLAUDE.md validation gate; this change does not touch convex/)**

```bash
bun run test:convex
```

Expected: pass (unaffected).

- [ ] **Step 6: Full production build (exercises the whole pipeline)**

Run from `apps/web/`:

```bash
bun run build
```

Expected:
- `[build-learn-content] Wrote src/features/landing/learnPosts.generated.json (1 post(s))`
- `vite build` completes
- `[prerender-seo] Wrote /learn -> learn/index.html`
- `[prerender-seo] Wrote /learn/how-to-turn-lecture-slides-into-flashcards -> learn/how-to-turn-lecture-slides-into-flashcards/index.html`
- `[generate-sitemap] Wrote sitemap.xml (N URLs)` — N is 2 higher than before
- `[indexnow-sync] Skipped …` or `Enqueued 2 changed URL(s)` (either is fine locally)

- [ ] **Step 7: Inspect the prerendered post HTML**

```bash
grep -o '<title>[^<]*</title>' dist/learn/how-to-turn-lecture-slides-into-flashcards/index.html
grep -c 'data-seo-prerender="true"' dist/learn/how-to-turn-lecture-slides-into-flashcards/index.html
grep -o '"@type":"Article"' dist/learn/how-to-turn-lecture-slides-into-flashcards/index.html
grep -o 'rel="canonical" href="[^"]*"' dist/learn/how-to-turn-lecture-slides-into-flashcards/index.html
grep -o '<loc>https://www.solomindlm.com/learn[^<]*</loc>' dist/sitemap.xml
```

Expected: title is `How to Turn Lecture Slides Into Flashcards With AI`; `data-seo-prerender` count ≥ 5; `"@type":"Article"` present; canonical is `https://www.solomindlm.com/learn/how-to-turn-lecture-slides-into-flashcards`; sitemap lists both `/learn` and the post `<loc>`.

- [ ] **Step 8: Restore `public/sitemap.xml` if the build rewrote it with local (non-CI) values**

```bash
git status --porcelain apps/web/public/sitemap.xml
```

If modified, review the diff — the build writes the real sitemap and it *should* now include the two `/learn` URLs. Keep that change; it is the intended output. `git add apps/web/public/sitemap.xml`.

- [ ] **Step 9: Final commit**

```bash
git add -A
git commit -m "chore(learn): regenerate sitemap with /learn URLs (#88)"
```

(If nothing changed in Steps 1–8, skip this commit.)

- [ ] **Step 10: Push and open the PR**

```bash
git push -u origin claude/issue-88-seo-7d2dd4
gh pr create --repo samintisar/SolomindLM --base main \
  --title "feat(learn): markdown editorial content pipeline at /learn (#88)" \
  --body "$(cat <<'EOF'
Closes #88. Part of #87.

## What

- `content/learn/*.md` → `scripts/build-learn-content.ts` (gray-matter + marked, devDeps only) → committed `learnPosts.generated.json`.
- `learnPosts.ts` types the data and exposes helpers, mirroring `seoContentPages.ts`.
- Posts map into `PUBLIC_SEO_PAGES`, so `sitemap.xml`, IndexNow, and `prerender-seo.ts` pick them up with no script changes.
- `Article` JSON-LD per post with `datePublished` / `dateModified` / author (Person when named) from frontmatter.
- `/learn` index page grouped by cluster, prerendered and in the sitemap; posts link up to `/students` or `/research` and across to a related intent page.
- Shared helpers gained an optional `author` (Article structured data) and an absolute `canonicalUrl` override (public SEO pages + sitemap + SEOMeta).
- Seed post: `how-to-turn-lecture-slides-into-flashcards`. The 12-post cluster is #89.

## Out of scope

Article content beyond the seed (#89); keeping the app JS bundle off marketing routes (#94, which the "no bundle" acceptance criterion defers to).

## Verification

`typecheck:web` + `typecheck:convex` + `lint` + `test:web` + `test:convex` pass; `bun run build` emits `dist/learn/**/index.html` with correct `<head>`, `Article` JSON-LD, and sitemap entries.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| Build-time codegen (`.md` → JSON) | Task 2 |
| `learnPosts.ts` helper surface | Task 3 |
| Frontmatter schema + validation (required fields, dates, cluster, `relatedIntentPath` resolution, `draft`, slug) | Task 2 (Step 1) |
| `generateArticleStructuredData` `author` param | Task 4 |
| `canonicalUrl` override on `PublicSeoPage` / `SeoHeadInput` / `applySeoToHtml` / sitemap / `SEOMeta` | Task 5 |
| `buildLearnPostPrerenderBody` / `buildLearnIndexPrerenderBody` | Task 6 |
| `LEARN_SEO_PAGES` + `LEARN_INDEX_SEO_PAGE` in `PUBLIC_SEO_PAGES` | Task 7 |
| Prerender dispatcher registration | Task 7 (Step 4) |
| React routes + `isPublicPage` | Task 8 |
| `/learn` index grouped by cluster, links to hub + intent | Task 6 + Task 8 |
| Trusted-content assumption (`dangerouslySetInnerHTML`, no runtime sanitizer) | Task 8 (Step 1) + spec |
| Markdown rendering (GFM, heading IDs, leading-H1 strip, reading time) | Task 2 (Step 1) |
| Build/dev wiring + `learn:check` | Task 1 (Step 2) |
| Seed content | Task 1 (Step 4) |
| Tests §1 (learnPosts) / §2 (head smoke) / §3 (prerender) / §4 (author) | Tasks 3 / 7 / 6 / 4 |
| Acceptance-criteria mapping | Task 9 (Steps 6-7) |
| "No app JS bundle" criterion | Explicitly deferred to #94 (spec + PR body) |

**Placeholder scan:** No `TBD` / `TODO` / "add error handling" — validation rules, test bodies, and component code are spelled out.

**Type consistency:** `LearnPost` shape is identical in `build-learn-content.ts` (Task 2) and `learnPosts.ts` (Task 3): `slug, path, title, description, h1, navLabel, keywords?, datePublished, dateModified, author, cluster, canonicalUrl, ogImage, relatedIntentPath?, bodyHtml, headings[], readingTimeMinutes`. Helper names are stable across tasks: `getLearnPostBySlug`, `getLearnPostByPath`, `getLearnPostsByCluster`, `isLearnPath`, `slugFromLearnPath`, `getLearnBreadcrumbItems`, `getLearnClusterHub`, `LEARN_POSTS`, `LEARN_INDEX_PATH`, `LEARN_CLUSTER_ORDER`. `generateArticleStructuredData` `author?: string` param name matches its use in `LEARN_SEO_PAGES`. `canonicalUrl` is the field name on both `PublicSeoPage` and `SeoHeadInput`.

**Ambiguity check:** Biome `noDangerouslySetInnerHtml` rule state is called out with a concrete fallback (remove the comment). The seed post's `datePublished` (`2026-09-09`) is fixed so the JSON-LD smoke assertions are deterministic. Sitemap URL count assertion is relative ("2 higher") to avoid coupling to unrelated page counts.
