# Showcase Notebooks Seed (PR 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A checked-in manifest and an internal, resumable, idempotent seed that builds the seven showcase notebooks from the spec for a maintainer account (given by email), using the app's own ingestion, Studio, literature-review and deep-research paths, then publishes and features them.

**Architecture:** `convex/showcase/manifest.ts` is plain data (notebooks → sources → Studio items, plus a paper-discovery query, a literature-review question and a deep-research query). A pure state machine, `planSeed(notebook, snapshot)`, compares the manifest with what the database holds and returns the next steps. `convex/showcase/seed.ts` runs one `tick` chain per notebook: each tick reads a snapshot, runs the steps through small internal mutations in `convex/showcase/db.ts`, and schedules the next tick until the notebook is done or blocked. Idempotency needs no new table: the notebook is found by owner + title in the owner's "Showcase" folder, sources by URL / file name / title / DOI, and Studio items by counting rows of each kind; every mutation re-checks inside its own transaction, so re-runs and overlapping chains never duplicate work. The literature review and deep research go through their durable workflows (helpers are extracted from the public start/approve mutations so the seed shares that code); the seed accepts the workflow's column and plan pauses as the owner would. Paper sources found by discovery are stored with a new `fullTextPolicy: "open_license_only"`, so ingestion keeps full text only from CC BY / CC BY-SA / CC0 / public-domain copies and otherwise stores metadata + abstract.

**Tech Stack:** Convex (internal queries/mutations/actions, scheduler, file storage, `@convex-dev/workflow`), `convex-test` + vitest.

Spec: [`docs/superpowers/specs/2026-10-14-public-notebooks-design.md`](../specs/2026-10-14-public-notebooks-design.md) ("PR 3 — Showcase notebooks seed"). Depends on PR 1 (`notebooks.isPublic` / `publishedAt` / `isFeatured`, the `"viewer"` role, fork copying Studio literature tables). Base branch: `feature/public-notebooks`.

**Before any Convex change:** read `convex/_generated/ai/guidelines.md`.

**Commands** (run from the worktree root):

- Convex tests: `bun run test:convex -- <path>` (whole suite: `bun run test:convex`)
- Typecheck: `bun run typecheck:convex` then `bun run typecheck:web` (not in parallel)
- Codegen after adding Convex modules: `npx convex codegen`

> **Do not run the seed** (`showcase/seed:seedShowcase`) as part of implementing this plan. It spends Together/Mistral/Supadata/Voyage credits and writes to a real deployment. The Runbook at the end is for the maintainer, after review, and prod only with the user's explicit approval.

---

## Design decisions

| Question | Decision |
| --- | --- |
| Gate | Every seed function is `internalQuery` / `internalMutation` / `internalAction`. Internal functions are callable only from other Convex functions or by someone with deploy access (`npx convex run`, dashboard), so no env gate is needed. The eval gate (`RAG_EVALS_ENABLED` + `RAG_EVAL_SECRET`, `convex/eval/_gate.ts`) exists because those functions are public `action`s called over HTTP; reusing it here would add a secret without adding protection. The owner is always an argument (`ownerEmail`); every mutation looks the user up by the `email` index and throws if there is none. |
| Idempotency key | Owner + notebook title inside the owner's "Showcase" folder (like eval packs in the "Test" folder, `convex/eval/_seedPack.ts`). Sources: `fileUrl` for `url`/`youtube`, `fileName` for `file`/`text`, DOI (else title) for discovered papers. Studio items: the n-th manifest item of a kind is "started" when the notebook has more than n rows of that kind. Titles and metadata can't be keys because completed jobs overwrite both (`saveReportResults` sets the generated title and replaces `metadata`). |
| Failures | A failed source or Studio row blocks only itself; it is reported, never retried automatically (failed rows still count), so a broken job can't loop on paid calls. The maintainer deletes the failed item in the app and re-runs; the seed then recreates it. A failed literature review or deep-research run is retried from the chat (existing Retry), then the seed is re-run. |
| Waiting | Convex actions stop at 600 s and Studio jobs are scheduled, so no action waits. `tick` runs the steps, then reschedules itself (`ctx.scheduler.runAfter`): 10 s after it started something, 60 s while it only waits. A chain stops when its notebook is done or blocked, after 240 ticks (~4 h), or if its notebook disappears after it was created (so deleting a notebook mid-run doesn't resurrect it). |
| Load | At most `maxInFlight` (default 2, max 4) jobs per notebook run at once, counting Studio rows that are still generating, a running literature review and a running deep research. Notebook chains start 20 s apart. Deep research starts after the literature review's outputs are in Studio. |
| Publishing | Off by default: `publish: true` must be passed. Run once to build, review every notebook in the app, then run again with `publish: true` (nothing is regenerated). Publishing sets `isPublic`, `isFeatured` and `publishedAt` (kept if already public). `publishShowcaseNotebook` refuses a notebook that isn't finished. |
| Literature review outputs | The workflow's table and report carry `literatureReviewSessionId`, so they are chat-only (`convex/_model/literatureArtifacts.ts`). The seed copies them into new `literatureTables` / `literatureReports` rows without a session id (same fields `performNotebookFork` copies), which Studio lists, viewers open and forks copy. |
| Deep-research outputs | Already Studio-visible: `createResearchArtifacts` (`convex/research/artifacts.ts`) writes a `literatureTables` "…: Evidence Table" and a `literatureReports` row with no `literatureReviewSessionId`, and no review session points at them, so `isChatLiteratureTable/Report` return false. No copy is needed (and none is made — a `reports` row would duplicate the same report). |
| Prompts | No production prompt changes. The seed passes the options a user can pick in the Studio dialogs (counts 20/35/55 cards, 10/20/30 quiz questions, 5/10/15 written questions; difficulty; audio type/length; report/spreadsheet formats) and focus text written as a user would type it. `validateManifest` enforces those option sets. |
| Licences | Publishing republishes sources, so only verified public-domain or openly licensed material is used (Sources appendix): U.S. government works, CC BY arXiv papers, Wikipedia (CC BY-SA 4.0) and YouTube videos whose YouTube licence is "Creative Commons Attribution licence (reuse allowed)" (CC BY 3.0). Every source keeps its URL and a title naming the publisher, which is the attribution CC BY / CC BY-SA ask for. Wikipedia's ShareAlike may extend to Studio items generated from it; accepted (decision 4). Seeded papers are stored with `fullTextPolicy: "open_license_only"` (Task 1). |
| Author on the cards | The owner's own display name, as PR 1 shows it for every public notebook. No publisher-name feature (decision 2). |

## File map

| File | Change |
| --- | --- |
| `convex/schema.ts` | `documents.fullTextPolicy?: "open_license_only"` (widen only) |
| `convex/documents/paperIngest.ts` (+ test) | `isOpenFullTextLicense`; `ingestPaper` honours `fullTextPolicy` |
| `convex/documents/internal.ts` | `getDocumentDetails` returns `fullTextPolicy` |
| `convex/documents/embeddingJob.ts` | passes `fullTextPolicy` to `ingestPaper` |
| `convex/studio/literature_tables/index.ts` | extract `startLiteratureReviewRun`, `confirmLiteratureReviewColumnsForSession` |
| `convex/research/index.ts` | extract `sourcePolicyValidator`, `startDeepResearchRun`, `approveResearchPlanAndResume` |
| `convex/showcase/manifest.ts` (new) | types, `STUDIO_KINDS`, `sourceKey`, `SHOWCASE_NOTEBOOKS` |
| `convex/showcase/gettingStartedGuide.ts` (new) | the pasted-text guide for "Getting Started with SolomindLM" |
| `convex/showcase/manifestValidation.ts` (+ test) (new) | `validateManifest` |
| `convex/showcase/plan.ts` (+ test) (new) | `SeedSnapshot`, step/plan validators, `planSeed` |
| `convex/showcase/papers.ts` (+ test) (new) | `paperKey`, `pickDiscoveredPapers` |
| `convex/showcase/db.ts` (+ test) (new) | snapshot loading, `getSeedState`, `seedStatus`, step mutations, publish/unpublish/delete |
| `convex/showcase/seed.ts` (new) | `seedShowcase`, `tick` |
| `convex/_generated/api.d.ts` | codegen |

---

## Task 1: Open-licence policy for paper full text

Discovery-added papers are ingested by `ingestPaper` (`convex/documents/paperIngest.ts`), which today keeps the first full text it finds: a stored PDF, any open-access copy whatever its licence, or a scrape of the publisher's landing page. A published notebook lets every signed-in user read that text, so seeded papers must keep full text only under an open licence.

Scope (decision 3): the policy is opt-in per document. Only the showcase seed sets `fullTextPolicy` (in `addDiscoveredPapers`, Task 8); `documents.upload`, Discover, DOI/bibliography import and paper refresh never set it, so ingestion of users' papers is unchanged. Users' own public notebooks still republish whatever full text ingestion found (see Follow-ups).

**Files:** Modify `convex/schema.ts`, `convex/documents/paperIngest.ts`, `convex/documents/internal.ts`, `convex/documents/embeddingJob.ts`; test `convex/documents/paperIngest.test.ts`

- [ ] **Step 1: Write failing tests.** Append to `convex/documents/paperIngest.test.ts` (it already has `input`, `candidate`, `makeDeps`, `logger`, `longText`, `OCR_TEXT`, `pdfBytes`), and add `isOpenFullTextLicense` to the import from `./paperIngest`:

```ts
describe("isOpenFullTextLicense", () => {
  it.each([
    ["cc-by", true],
    ["CC BY 4.0", true],
    ["cc-by-sa", true],
    ["cc0", true],
    ["public-domain", true],
    ["https://creativecommons.org/licenses/by/4.0/", true],
    ["http://creativecommons.org/publicdomain/zero/1.0/", true],
    ["cc-by-nc", false],
    ["cc-by-nc-nd", false],
    ["https://creativecommons.org/licenses/by-nc/4.0/", false],
    ["publisher-specific-oa", false],
    ["https://www.elsevier.com/tdm/userlicense/1.0/", false],
    [undefined, false],
  ])("%s → %s", (license, expected) => {
    expect(isOpenFullTextLicense(license)).toBe(expected);
  });
});

describe("open_license_only", () => {
  it("skips open-access copies without an open licence and never scrapes the landing page", async () => {
    const deps = makeDeps({
      resolveCandidates: vi.fn().mockResolvedValue([
        candidate({ url: "https://a.example/1.pdf", host: "a.example", license: "cc-by-nc" }),
        candidate({ url: "https://b.example/2.pdf", host: "b.example" }),
      ]),
      scrape: vi.fn().mockResolvedValue({ title: "Landing", content: longText }),
    });
    const out = await ingestPaper(input({ fullTextPolicy: "open_license_only" }), deps, logger);
    expect(out.outcome).toBe("abstract_only");
    expect(deps.fetchCandidate).not.toHaveBeenCalled();
    expect(deps.scrape).not.toHaveBeenCalled();
  });

  it("keeps full text from a CC BY open-access PDF", async () => {
    const deps = makeDeps({
      resolveCandidates: vi.fn().mockResolvedValue([candidate({ license: "cc-by" })]),
      fetchCandidate: vi.fn().mockResolvedValue({
        type: "pdf",
        bytes: pdfBytes,
        finalUrl: "https://arxiv.org/pdf/1304.1068",
      }),
    });
    const out = await ingestPaper(input({ fullTextPolicy: "open_license_only" }), deps, logger);
    expect(out).toMatchObject({
      outcome: "full_text",
      content: OCR_TEXT,
      fullTextSource: { method: "oa_pdf", license: "cc-by" },
    });
  });

  it("does not read a stored PDF whose licence is unknown", async () => {
    const deps = makeDeps();
    const out = await ingestPaper(
      input({ storageId: "storage_1", fullTextPolicy: "open_license_only" }),
      deps,
      logger
    );
    expect(deps.ocrStoredPdf).not.toHaveBeenCalled();
    expect(out.outcome).toBe("abstract_only");
  });

  it("without the policy, still scrapes the landing page", async () => {
    const deps = makeDeps({
      scrape: vi.fn().mockResolvedValue({ title: "Landing", content: longText }),
    });
    const out = await ingestPaper(input(), deps, logger);
    expect(out).toMatchObject({ outcome: "full_text", fullTextSource: { method: "landing_page" } });
  });
});
```

- [ ] **Step 2: Run, expect failure.** `bun run test:convex -- convex/documents/paperIngest.test.ts`. Expected: FAIL (`isOpenFullTextLicense` is not exported; `fullTextPolicy` is not a known input field). If the last test fails for an unrelated reason (the landing-page length floor), compare with the existing `describe("landing page")` cases and use the content they use.

- [ ] **Step 3: Implement in `convex/documents/paperIngest.ts`.**

Add to `PaperIngestInput`:

```ts
  /**
   * "open_license_only": keep full text only from an open-access copy under an open licence
   * (`isOpenFullTextLicense`); never the landing page, and a stored PDF only when its recorded
   * licence is open. Set on sources that get published (the showcase seed).
   */
  fullTextPolicy?: "open_license_only";
```

Add below the constants:

```ts
const OPEN_LICENSE_IDS = new Set(["cc-by", "cc-by-sa", "cc0", "public-domain", "pd"]);

/**
 * True for licences that allow anyone to redistribute the full text, commercially included:
 * CC BY, CC BY-SA, CC0 and public domain. Accepts Unpaywall/OpenAlex ids ("cc-by"), labels
 * ("CC BY 4.0") and creativecommons.org URLs (Crossref). NC/ND variants and publisher
 * licences are not open.
 */
export function isOpenFullTextLicense(license: string | undefined): boolean {
  const raw = license?.trim().toLowerCase();
  if (!raw) return false;
  const url = raw.match(/creativecommons\.org\/(licenses|publicdomain)\/([a-z-]+)/);
  if (url) {
    return url[1] === "publicdomain"
      ? url[2] === "zero" || url[2] === "mark"
      : url[2] === "by" || url[2] === "by-sa";
  }
  const id = raw.replace(/[\s_]+/g, "-").replace(/-\d+(\.\d+)*$/, "");
  return OPEN_LICENSE_IDS.has(id);
}
```

In `ingestPaper`, after `const deadline = …`:

```ts
  const openOnly = input.fullTextPolicy === "open_license_only";
```

Change the three steps:

```ts
  // 1. A PDF already on the source. A transient OCR failure throws so the caller can retry.
  if (input.storageId && (!openOnly || isOpenFullTextLicense(input.fullTextSource?.license))) {
```

```ts
  const candidates = (await resolveCandidatesSafely(pr, deps, logger)).filter(
    (candidate) => !openOnly || isOpenFullTextLicense(candidate.license)
  );
```

```ts
  // 3. The landing page (never under the open-licence policy: a publisher page has no licence).
  const landing = input.fileUrl?.trim() || pr.landingPageUrl?.trim();
  if (!openOnly && landing && !ctx.tried.has(candidateKey(landing))) {
```

Update the file's header comment: after step 4 add "Under `fullTextPolicy: \"open_license_only\"` only openly licensed copies count (steps 1–2) and step 3 is skipped."

- [ ] **Step 4: Schema.** In `convex/schema.ts`, `documents: defineTable({...})`, below `fullTextSource`:

```ts
    /** Set by the showcase seed: paper full text is kept only under an open licence (`ingestPaper`). */
    fullTextPolicy: v.optional(v.literal("open_license_only")),
```

- [ ] **Step 5: Wire it through.** `convex/documents/internal.ts` `getDocumentDetails`: add `fullTextPolicy: doc.fullTextPolicy,` to the returned object. `convex/documents/embeddingJob.ts`: in the `ingestPaper({...})` input add `fullTextPolicy: docDetails.fullTextPolicy,` after `fullTextSource`.

- [ ] **Step 6: Run tests and typecheck.** `bun run test:convex -- convex/documents` then `bun run typecheck:convex`. Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
git add convex/schema.ts convex/documents/paperIngest.ts convex/documents/paperIngest.test.ts convex/documents/internal.ts convex/documents/embeddingJob.ts
git commit -m "feat(documents): open-licence-only full text policy for paper sources"
```

---

## Task 2: Shared start/confirm helpers for the literature review

The seed must start a review and accept its columns without a signed-in user and without spending the owner's run limits. Extract the bodies of the public mutations so both paths share one implementation.

**Files:** Modify `convex/studio/literature_tables/index.ts`

- [ ] **Step 1: Imports.** Change `import type { QueryCtx } from "../../_generated/server";` to `import type { MutationCtx, QueryCtx } from "../../_generated/server";` and add `type LiteratureSearchOptions` to the `../../_model/literatureReviewSearchOptions` import.

- [ ] **Step 2: Extract `confirmLiteratureReviewColumnsForSession`.** Add above `confirmLiteratureReviewColumns`:

```ts
type ConfirmedColumn = { id: string; name: string; instructions?: string; isVisible: boolean };

/** Saves the confirmed columns and resumes the workflow waiting for them. Callers check access. */
export async function confirmLiteratureReviewColumnsForSession(
  ctx: MutationCtx,
  session: Doc<"literatureReviewSessions">,
  confirmedColumns: ConfirmedColumn[]
): Promise<void> {
  if (!session.workflowId) {
    throw new Error(`Session ${session._id} does not have an associated workflowId`);
  }
  await ctx.db.patch(session._id, {
    confirmedColumns,
    status: "searching",
    updatedAt: Date.now(),
  });
  await sendEvent(ctx, components.workflow, {
    name: "columnsConfirmed",
    workflowId: session.workflowId as WorkflowId,
    value: { confirmedColumns },
  });
}
```

In `confirmLiteratureReviewColumns`, replace everything from `if (!session.workflowId) {` through the `sendEvent(...)` call with:

```ts
    await confirmLiteratureReviewColumnsForSession(ctx, session, args.confirmedColumns);
```

(keep `return null;`).

- [ ] **Step 3: Extract `startLiteratureReviewRun`.** Add above `startLiteratureReview`:

```ts
type StartLiteratureReviewArgs = {
  query: string;
  notebookId: Id<"notebooks">;
  conversationId?: Id<"conversations">;
  searchOptions?: LiteratureSearchOptions;
  smartModel?: string;
  documentIds?: Id<"documents">[];
  paperScope?: PaperScope;
};

/**
 * Creates the review session and its chat messages and starts the workflow. Callers check edit
 * access and run limits first: `startLiteratureReview` for users; the showcase seed is internal
 * and skips limits.
 */
export async function startLiteratureReviewRun(
  ctx: MutationCtx,
  userId: Id<"users">,
  args: StartLiteratureReviewArgs
): Promise<{
  sessionId: Id<"literatureReviewSessions">;
  conversationId: Id<"conversations">;
}> {
  // MOVE HERE, unchanged: the current `startLiteratureReview` handler body from the line
  // `// Keep only this notebook's finished PDFs and saved papers; the client list is not trusted.`
  // through `return { sessionId, conversationId };`
}
```

That block uses only `ctx`, `userId` and `args.*`, so it moves verbatim (delete the placeholder comment once the code is in). The public handler becomes:

```ts
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    await assertCanEditNotebook(ctx, args.notebookId, userId);

    // Count the run now, not on success: a review takes minutes, so parallel starts
    // would otherwise all pass the check. Mutations are atomic, so a later throw undoes it.
    const { isPro } = await takeFeatureRun(ctx, userId, "literatureReview");
    await assertConcurrentRunCapacity(ctx, userId, "literatureReview", isPro);

    return await startLiteratureReviewRun(ctx, userId, args);
  },
```

- [ ] **Step 4: Run the existing tests.** `bun run test:convex -- convex/studio/literature_tables convex/notebooks/viewerWriteGuard.test.ts` then `bun run typecheck:convex`. Expected: PASS, no behaviour change.

- [ ] **Step 5: Commit.**

```bash
git add convex/studio/literature_tables/index.ts
git commit -m "refactor(literature): share the review start and column confirm logic"
```

---

## Task 3: Shared start/approve helpers for deep research

**Files:** Modify `convex/research/index.ts`

- [ ] **Step 1: Imports.** `import { ConvexError, type Infer, v } from "convex/values";`, `import type { Doc, Id } from "../_generated/dataModel";`, and add `type MutationCtx` to the `../_generated/server` import.

- [ ] **Step 2: Extract the source policy validator.** Above `startDeepResearch`:

```ts
/** Where deep research looks; the same shape the workflow takes. */
const sourcePolicyValidator = v.object({
  channels: v.array(v.string()),
  domainAllowlist: v.optional(v.array(v.string())),
  dateRange: v.optional(v.object({ start: v.number(), end: v.number() })),
  maxResultsPerChannel: v.optional(v.number()),
  credibilityTier: v.optional(v.string()),
  requirePrimarySources: v.optional(v.boolean()),
  recencyDays: v.optional(v.number()),
  dedupeStrategy: v.optional(v.string()),
  academicFilters: v.optional(
    v.object({
      publicationYearFrom: v.optional(v.number()),
      publicationYearTo: v.optional(v.number()),
      minCitations: v.optional(v.number()),
      openAccessOnly: v.optional(v.boolean()),
      hasFullText: v.optional(v.boolean()),
      fieldOfStudyTerms: v.optional(v.array(v.string())),
    })
  ),
});

type SourcePolicy = Infer<typeof sourcePolicyValidator>;
```

In `startDeepResearch`'s args replace the inline object with `sourcePolicy: v.optional(sourcePolicyValidator),`.

- [ ] **Step 3: Extract `startDeepResearchRun`.**

```ts
/**
 * Creates the chat messages and plan row and starts the deep-research workflow. Callers check
 * edit access and run limits first (`startDeepResearch`; the showcase seed is internal).
 */
export async function startDeepResearchRun(
  ctx: MutationCtx,
  userId: Id<"users">,
  args: {
    notebookId: Id<"notebooks">;
    conversationId?: Id<"conversations">;
    query: string;
    sourcePolicy?: SourcePolicy;
    smartModel?: string;
  }
): Promise<{ planId: Id<"researchPlans">; conversationId: Id<"conversations"> }> {
  // MOVE HERE, unchanged: the current `startDeepResearch` handler body from
  // `// Ensure conversation exists` through `return { planId, conversationId };`
}
```

The public handler keeps auth, `assertCanEditNotebook`, `takeFeatureRun`, `assertConcurrentRunCapacity`, then `return await startDeepResearchRun(ctx, userId, args);`.

- [ ] **Step 4: Extract `approveResearchPlanAndResume`.**

```ts
type SubQuestionEdit = {
  id: string;
  question: string;
  searchQueries: string[];
  sourceChannels: string[];
};

/** Approves the plan (with the user's edits, if any) and resumes its workflow. Callers check access. */
export async function approveResearchPlanAndResume(
  ctx: MutationCtx,
  plan: Doc<"researchPlans">,
  modifiedSubQuestions?: SubQuestionEdit[]
): Promise<void> {
  const subQuestions = modifiedSubQuestions
    ? modifiedSubQuestions.map((sq) => ({ ...sq, status: "pending" as const }))
    : plan.subQuestions;
  await ctx.db.patch(plan._id, { subQuestions, status: "approved", updatedAt: Date.now() });
  if (plan.workflowId) {
    await sendEvent(ctx, components.workflow, {
      name: "planApproved",
      workflowId: plan.workflowId as WorkflowId,
      value: { planId: plan._id, modifiedSubQuestions },
    });
  }
}
```

In `approveResearchPlan`, after `await assertCanEditNotebook(ctx, plan.notebookId, userId);`, replace the rest with:

```ts
    await approveResearchPlanAndResume(ctx, plan, args.modifiedSubQuestions);
    return args.planId;
```

- [ ] **Step 5: Run the existing tests.** `bun run test:convex -- convex/research convex/notebooks/viewerWriteGuard.test.ts` then `bun run typecheck:convex`. Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add convex/research/index.ts
git commit -m "refactor(research): share the deep research start and plan approval logic"
```

---

## Task 4: Manifest types and validation

**Files:** Create `convex/showcase/manifest.ts` (types + `sourceKey` + an empty list for now), `convex/showcase/manifestValidation.ts`, `convex/showcase/manifestValidation.test.ts`

- [ ] **Step 1: Types.** Create `convex/showcase/manifest.ts`:

```ts
/**
 * The showcase notebooks (public-notebooks spec, PR 3): plain data that `seed.ts` builds through
 * the app's own ingestion, Studio, literature-review and deep-research paths. Publishing a
 * notebook lets every signed-in user read its sources, so each source records its licence and
 * must be public domain or openly licensed (see the plan's Sources appendix). Studio options are
 * the ones a user can pick in the Studio dialogs; `validateManifest` checks them.
 */

/** Folder the seeded notebooks live in, in the owner's account. */
export const SHOWCASE_FOLDER_NAME = "Showcase";

export const STUDIO_KINDS = [
  "report",
  "flashcards",
  "quiz",
  "writtenQuestions",
  "mindmap",
  "audio",
  "infographic",
  "spreadsheet",
] as const;

export type StudioKind = (typeof STUDIO_KINDS)[number];

type Difficulty = "easy" | "medium" | "hard";

export type ShowcaseSource =
  | { kind: "url"; title: string; url: string; licence: string }
  | { kind: "youtube"; title: string; url: string; licence: string }
  /** A PDF the seed fetches and stores, like an uploaded file. */
  | { kind: "file"; fileName: string; url: string; licence: string }
  | { kind: "text"; title: string; text: string; licence: string };

export type ShowcaseStudioItem =
  | {
      kind: "report";
      reportType:
        | "briefing"
        | "study_guide"
        | "blog_post"
        | "summary"
        | "technical_report"
        | "concept_explainer"
        | "methodology_overview"
        | "custom";
      prompt?: string;
    }
  | { kind: "flashcards"; cardCount: number; difficulty: Difficulty; topic?: string }
  | { kind: "quiz"; questionCount: number; difficulty: Difficulty; focus?: string }
  | {
      kind: "writtenQuestions";
      questionCount: number;
      difficulty: Difficulty;
      questionType: "short" | "essay";
      focus?: string;
    }
  | { kind: "mindmap"; prompt?: string }
  | {
      kind: "audio";
      audioType: "deep_dive" | "brief" | "critique" | "debate";
      length: "short" | "default" | "long";
      focus?: string;
    }
  | {
      kind: "infographic";
      prompt?: string;
      orientation?: "landscape" | "portrait" | "square";
      detailLevel?: "concise" | "standard" | "detailed";
    }
  | {
      kind: "spreadsheet";
      spreadsheetType:
        | "data_extraction"
        | "comparison_table"
        | "timeline"
        | "financial_summary"
        | "custom";
      prompt?: string;
    };

type AcademicFilters = {
  publicationYearFrom?: number;
  publicationYearTo?: number;
  minCitations?: number;
  openAccessOnly?: boolean;
  hasFullText?: boolean;
};

/** Papers added the way Discover adds them: an academic search, then DOI metadata. */
export interface PaperDiscovery {
  query: string;
  filters: AcademicFilters;
  /** How many papers to add. */
  take: number;
  /**
   * The papers the first (dev) run found, pinned so prod gets the same set: when present the seed
   * resolves these DOIs (the "Import from DOI" path) instead of searching. Exactly `take` of them.
   */
  pinnedDois?: string[];
}

export interface ShowcaseLiteratureReview {
  /** Typed into the composer in Literature Review mode; the planner derives criteria from it. */
  question: string;
  researchDatabase: "all" | "pubmed" | "arxiv";
  academicFilters?: AcademicFilters;
}

export interface ShowcaseDeepResearch {
  query: string;
  channels: Array<"notebook" | "web" | "academic" | "news">;
}

export interface ShowcaseNotebook {
  slug: string;
  title: string;
  icon: string;
  coverColor: string;
  chatMode?: "learningGuide";
  sources: ShowcaseSource[];
  paperDiscovery?: PaperDiscovery;
  studio: ShowcaseStudioItem[];
  literatureReview?: ShowcaseLiteratureReview;
  deepResearch?: ShowcaseDeepResearch;
}

/** How a manifest source is matched to a stored document (`fileUrl` or `fileName`). */
export function sourceKey(source: ShowcaseSource): string {
  switch (source.kind) {
    case "url":
    case "youtube":
      return source.url;
    case "file":
      return source.fileName;
    case "text":
      return source.title;
  }
}

export const SHOWCASE_NOTEBOOKS: ShowcaseNotebook[] = [];
```

- [ ] **Step 2: Write failing tests.** Create `convex/showcase/manifestValidation.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import type { ShowcaseNotebook } from "./manifest";
import { validateManifest } from "./manifestValidation";

const valid = (over: Partial<ShowcaseNotebook> = {}): ShowcaseNotebook => ({
  slug: "test-notebook",
  title: "Test Notebook",
  icon: "Book",
  coverColor: "bg-vintage-blue-300",
  sources: [
    {
      kind: "url",
      title: "Supply and demand",
      url: "https://en.wikipedia.org/wiki/Supply_and_demand",
      licence: "CC BY-SA 4.0",
    },
  ],
  studio: [{ kind: "flashcards", cardCount: 35, difficulty: "medium" }],
  ...over,
});

describe("validateManifest", () => {
  test("accepts a valid notebook", () => {
    expect(validateManifest([valid()])).toEqual([]);
  });

  test("rejects duplicate slugs and titles", () => {
    expect(validateManifest([valid(), valid()])).toEqual([
      'notebook "test-notebook": duplicate slug',
      'notebook "test-notebook": duplicate title',
    ]);
  });

  test("rejects counts a user can't pick in the Studio dialogs", () => {
    const errors = validateManifest([
      valid({
        studio: [
          { kind: "flashcards", cardCount: 60, difficulty: "medium" },
          { kind: "quiz", questionCount: 12, difficulty: "easy" },
          { kind: "writtenQuestions", questionCount: 7, difficulty: "easy", questionType: "short" },
        ],
      }),
    ]);
    expect(errors).toEqual([
      'notebook "test-notebook" studio item 0: cardCount must be one of 20, 35, 55',
      'notebook "test-notebook" studio item 1: questionCount must be one of 10, 20, 30',
      'notebook "test-notebook" studio item 2: questionCount must be one of 5, 10, 15',
    ]);
  });

  test("a custom report or spreadsheet needs a prompt", () => {
    const errors = validateManifest([
      valid({
        studio: [
          { kind: "report", reportType: "custom" },
          { kind: "spreadsheet", spreadsheetType: "custom" },
        ],
      }),
    ]);
    expect(errors).toEqual([
      'notebook "test-notebook" studio item 0: a custom report needs a prompt',
      'notebook "test-notebook" studio item 1: a custom spreadsheet needs a prompt',
    ]);
  });

  test("checks the source count, URLs, licences and file names", () => {
    const errors = validateManifest([
      valid({
        sources: [
          { kind: "url", title: "A", url: "http://example.org/a", licence: "CC BY 4.0" },
          { kind: "youtube", title: "B", url: "https://vimeo.com/1", licence: "CC BY 4.0" },
          { kind: "file", fileName: "report.docx", url: "https://example.org/r", licence: "PD" },
          { kind: "text", title: "C", text: "too short", licence: "" },
          { kind: "url", title: "A2", url: "http://example.org/a", licence: "CC BY 4.0" },
          { kind: "url", title: "D", url: "https://example.org/d", licence: "CC BY 4.0" },
          { kind: "url", title: "E", url: "https://example.org/e", licence: "CC BY 4.0" },
        ],
      }),
    ]);
    expect(errors).toEqual([
      'notebook "test-notebook": needs 1–6 sources, has 7',
      'notebook "test-notebook" source 0: url must be https',
      'notebook "test-notebook" source 1: not a YouTube URL',
      'notebook "test-notebook" source 2: a file source must be a .pdf',
      'notebook "test-notebook" source 3: text must be 500–20000 characters',
      'notebook "test-notebook" source 3: licence is required',
      'notebook "test-notebook" source 4: url must be https',
      'notebook "test-notebook" source 4: duplicate source',
    ]);
  });

  test("a literature review needs discovered papers; deep research needs sources", () => {
    const errors = validateManifest([
      valid({
        studio: [],
        literatureReview: { question: "Does it work?", researchDatabase: "all" },
      }),
    ]);
    expect(errors).toEqual([
      'notebook "test-notebook": a literature review needs paperDiscovery',
    ]);
  });

  test("pinned DOIs must match the paper count and be distinct", () => {
    const review = (pinnedDois: string[]) =>
      valid({
        sources: [],
        studio: [],
        paperDiscovery: { query: "spacing effect", filters: {}, take: 2, pinnedDois },
        literatureReview: { question: "Does it work?", researchDatabase: "all" },
      });
    expect(validateManifest([review(["10.1/a", "10.1/b"])])).toEqual([]);
    expect(validateManifest([review(["10.1/a", "10.1/A"])])).toEqual([
      'notebook "test-notebook": pinnedDois must be 2 distinct DOIs',
    ]);
    expect(validateManifest([review(["10.1/a"])])).toEqual([
      'notebook "test-notebook": pinnedDois must be 2 distinct DOIs',
    ]);
  });

  test("checks the icon and cover colour against the app's pickers", () => {
    expect(validateManifest([valid({ icon: "Rocket", coverColor: "bg-pink-500" })])).toEqual([
      'notebook "test-notebook": unknown icon "Rocket"',
      'notebook "test-notebook": unknown cover colour "bg-pink-500"',
    ]);
  });
});
```

- [ ] **Step 3: Run, expect failure.** `bun run test:convex -- convex/showcase/manifestValidation.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 4: Implement.** Create `convex/showcase/manifestValidation.ts`:

```ts
import { TEXT_TITLE_MAX_LENGTH } from "../_lib/textTitle";
import {
  type ShowcaseNotebook,
  type ShowcaseSource,
  type ShowcaseStudioItem,
  sourceKey,
} from "./manifest";

/** Counts the Studio dialogs offer (apps/web/src/features/studio/hooks/flows/useCreate*Flow.ts). */
const FLASHCARD_COUNTS = [20, 35, 55];
const QUIZ_COUNTS = [10, 20, 30];
const WRITTEN_QUESTION_COUNTS = [5, 10, 15];

/** apps/web/src/shared/notebook/notebookIcons.ts NOTEBOOK_ICON_NAMES. */
const NOTEBOOK_ICONS = [
  "Book",
  "BarChart",
  "Monitor",
  "Search",
  "Brain",
  "Globe",
  "FileText",
  "GraduationCap",
  "Lightbulb",
];

/** apps/web/src/shared/notebook/coverColor.ts COVER_COLORS. */
const COVER_COLOR = /^bg-vintage-(brown|red|orange|amber|green|blue)-(200|300|400|500)$/;

const MAX_SOURCES = 6;
const MAX_PROMPT_CHARS = 600;
const TEXT_SOURCE_CHARS = { min: 500, max: 20_000 };

function httpsUrl(url: string): URL | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed : null;
  } catch {
    return null;
  }
}

function validateSource(source: ShowcaseSource): string[] {
  const errors: string[] = [];
  if (source.kind === "text") {
    if (!source.title.trim() || source.title.length > TEXT_TITLE_MAX_LENGTH) {
      errors.push(`title must be 1–${TEXT_TITLE_MAX_LENGTH} characters`);
    }
    if (source.text.length < TEXT_SOURCE_CHARS.min || source.text.length > TEXT_SOURCE_CHARS.max) {
      errors.push(`text must be ${TEXT_SOURCE_CHARS.min}–${TEXT_SOURCE_CHARS.max} characters`);
    }
  } else {
    const url = httpsUrl(source.url);
    if (!url) errors.push("url must be https");
    if (source.kind === "youtube" && url && !/(^|\.)youtube\.com$|^youtu\.be$/.test(url.hostname)) {
      errors.push("not a YouTube URL");
    }
    if (source.kind === "file" && !source.fileName.toLowerCase().endsWith(".pdf")) {
      errors.push("a file source must be a .pdf");
    }
  }
  if (!source.licence.trim()) errors.push("licence is required");
  return errors;
}

function oneOf(name: string, value: number, allowed: number[]): string[] {
  return allowed.includes(value) ? [] : [`${name} must be one of ${allowed.join(", ")}`];
}

function validateStudioItem(item: ShowcaseStudioItem): string[] {
  const errors: string[] = [];
  const text =
    "prompt" in item ? item.prompt : "focus" in item ? item.focus : "topic" in item ? item.topic : undefined;
  if (text !== undefined && (!text.trim() || text.length > MAX_PROMPT_CHARS)) {
    errors.push(`prompt/focus must be 1–${MAX_PROMPT_CHARS} characters`);
  }
  switch (item.kind) {
    case "flashcards":
      return [...errors, ...oneOf("cardCount", item.cardCount, FLASHCARD_COUNTS)];
    case "quiz":
      return [...errors, ...oneOf("questionCount", item.questionCount, QUIZ_COUNTS)];
    case "writtenQuestions":
      return [...errors, ...oneOf("questionCount", item.questionCount, WRITTEN_QUESTION_COUNTS)];
    case "report":
      return item.reportType === "custom" && !item.prompt
        ? [...errors, "a custom report needs a prompt"]
        : errors;
    case "spreadsheet":
      return item.spreadsheetType === "custom" && !item.prompt
        ? [...errors, "a custom spreadsheet needs a prompt"]
        : errors;
    default:
      return errors;
  }
}

/** Every problem with the manifest, as readable lines; empty when it is valid. */
export function validateManifest(notebooks: readonly ShowcaseNotebook[]): string[] {
  const errors: string[] = [];
  const slugs = new Set<string>();
  const titles = new Set<string>();
  for (const notebook of notebooks) {
    const where = `notebook "${notebook.slug}"`;
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(notebook.slug)) errors.push(`${where}: slug must be kebab-case`);
    if (slugs.has(notebook.slug)) errors.push(`${where}: duplicate slug`);
    slugs.add(notebook.slug);
    if (titles.has(notebook.title)) errors.push(`${where}: duplicate title`);
    titles.add(notebook.title);
    if (!notebook.title || notebook.title !== notebook.title.trim()) {
      errors.push(`${where}: title must be non-empty and trimmed`);
    }
    if (!NOTEBOOK_ICONS.includes(notebook.icon)) errors.push(`${where}: unknown icon "${notebook.icon}"`);
    if (!COVER_COLOR.test(notebook.coverColor)) {
      errors.push(`${where}: unknown cover colour "${notebook.coverColor}"`);
    }

    const sourceCount = notebook.sources.length + (notebook.paperDiscovery?.take ?? 0);
    if (sourceCount < 1 || sourceCount > MAX_SOURCES) {
      errors.push(`${where}: needs 1–${MAX_SOURCES} sources, has ${sourceCount}`);
    }
    const keys = new Set<string>();
    notebook.sources.forEach((source, i) => {
      for (const error of validateSource(source)) errors.push(`${where} source ${i}: ${error}`);
      const key = sourceKey(source);
      if (keys.has(key)) errors.push(`${where} source ${i}: duplicate source`);
      keys.add(key);
    });
    notebook.studio.forEach((item, i) => {
      for (const error of validateStudioItem(item)) errors.push(`${where} studio item ${i}: ${error}`);
    });

    const discovery = notebook.paperDiscovery;
    if (discovery && (!discovery.query.trim() || discovery.take < 1)) {
      errors.push(`${where}: paperDiscovery needs a query and take ≥ 1`);
    }
    const pinned = discovery?.pinnedDois;
    if (discovery && pinned) {
      const unique = new Set(pinned.map((doi) => doi.trim().toLowerCase()));
      if (pinned.length !== discovery.take || unique.size !== pinned.length) {
        errors.push(`${where}: pinnedDois must be ${discovery.take} distinct DOIs`);
      }
    }
    if (notebook.literatureReview && !discovery) {
      errors.push(`${where}: a literature review needs paperDiscovery`);
    }
    if (notebook.studio.length === 0 && !notebook.literatureReview && !notebook.deepResearch) {
      errors.push(`${where}: has nothing to generate`);
    }
  }
  return errors;
}
```

- [ ] **Step 5: Run.** `bun run test:convex -- convex/showcase/manifestValidation.test.ts`. Expected: PASS. If an expected array differs only in order, fix the implementation to emit errors in the order the test lists (notebook-level checks, then sources, then items) rather than editing the test.

- [ ] **Step 6: Commit.**

```bash
git add convex/showcase/manifest.ts convex/showcase/manifestValidation.ts convex/showcase/manifestValidation.test.ts
git commit -m "feat(showcase): manifest types and validation"
```

---

## Task 5: The seven notebooks and the Getting Started guide

**Files:** Create `convex/showcase/gettingStartedGuide.ts`; modify `convex/showcase/manifest.ts`; test `convex/showcase/manifestValidation.test.ts`

- [ ] **Step 1: Failing test.** Append to `manifestValidation.test.ts` (and import `SHOWCASE_NOTEBOOKS` from `./manifest`):

```ts
describe("SHOWCASE_NOTEBOOKS", () => {
  test("is valid", () => {
    expect(validateManifest(SHOWCASE_NOTEBOOKS)).toEqual([]);
  });

  test("covers every Studio type, a literature review and deep research", () => {
    const kinds = new Set(SHOWCASE_NOTEBOOKS.flatMap((n) => n.studio.map((item) => item.kind)));
    expect([...kinds].sort()).toEqual(
      ["audio", "flashcards", "infographic", "mindmap", "quiz", "report", "spreadsheet", "writtenQuestions"]
    );
    expect(SHOWCASE_NOTEBOOKS.filter((n) => n.literatureReview)).toHaveLength(1);
    expect(SHOWCASE_NOTEBOOKS.filter((n) => n.deepResearch)).toHaveLength(1);
  });
});
```

Run: `bun run test:convex -- convex/showcase/manifestValidation.test.ts`. Expected: FAIL (the list is empty).

- [ ] **Step 2: The guide.** Create `convex/showcase/gettingStartedGuide.ts`. The text describes features that exist in the codebase (checked against `landingHomeContent.ts`, the add-source dialog, `ConfigureChatModal.tsx`, the Studio dialogs, `ShareNotebookModal.tsx`); no plan limits, prices or comparisons, since limits change and the repo is public. Before committing, re-check each sentence against the app on the branch being merged (drop anything not shipped there):

```ts
/** Pasted-text source for "Getting Started with SolomindLM". Plain, factual, no pricing. */
export const GETTING_STARTED_GUIDE = `# Getting Started with SolomindLM

SolomindLM is a notebook for studying and research. You collect sources in a notebook, ask questions about them in chat, and turn them into study and research material in Studio. Everything is written from the sources you select, and chat answers cite the passages they use.

## 1. Create a notebook

Create one notebook per course, project or question. You can rename it and choose a cover colour and icon, and folders keep related notebooks together.

## 2. Add sources

Use Add source in the Sources panel. A notebook can hold:

- Files: PDFs, slides and documents, images and scans (read with text recognition), and audio recordings (transcribed).
- Web pages and YouTube videos. The app reads the page text or the video transcript.
- Copied text pasted straight into the notebook.
- Files from Google Drive.
- Research papers: import by DOI or arXiv link, import a bibliography file (BibTeX or RIS, including exports from Zotero or Mendeley), or add a paper by hand.

Discover searches the web, news and academic databases from inside the notebook, so you can add what you find without leaving it.

Each source shows its progress while it is read. When it is ready, open it to read the extracted text and its source guide, a short summary with the topics it covers.

## 3. Chat with your sources

Ask anything about the sources you have selected. Answers cite the passages they rely on; open a citation to see the passage, and for PDFs the page it is on. Chat settings change how answers are written: Default, Learning Guide (a step-by-step teaching style that helps you work things out), or your own instructions, with shorter or longer answers.

The composer has two more modes. Deep Research writes a plan of sub-questions for you to approve, then searches your notebook, the web and academic databases and writes a cited report with an evidence table. Literature Review searches academic databases, suggests the columns to extract for you to confirm, screens papers against eligibility criteria with a reason for each decision, extracts the data into a literature table and drafts a review.

## 4. Create in Studio

Studio turns your selected sources into:

- Reports: briefing documents, study guides, summaries, technical reports, blog posts, concept explainers, methodology overviews, or a format you describe.
- Flashcards that use spaced repetition, so each card comes back just before you would forget it.
- Quizzes with multiple-choice questions that explain each answer.
- Written questions, short-answer or essay, with feedback on what you write.
- Mind maps of the concepts in your sources.
- Audio overviews: a conversation between two hosts as a deep dive, a brief, a critique or a debate, in a short, default or long length, with an optional focus.
- Infographics that sum up your sources in one image.
- Spreadsheets that pull structured tables out of your sources: data tables, comparisons, timelines, financial summaries, or your own layout.

Most tools let you set a count, a difficulty or a focus before you generate.

## 5. Share a notebook

Invite people to work on a notebook with you, or share a link that lets someone fork their own copy. You can also make a notebook public: every signed-in user can then read its sources and Studio items, chat with it privately and fork it. Public notebooks are listed on the Public tab of the home page.

## Tips

- Select only the sources you need before you chat or generate; everything is based on the selection.
- Add sources in the language you study in, and choose the language generated content is written in from your account menu.
- Start with a brief audio overview or a summary report to get the shape of a new topic, then use flashcards and quizzes to practise.
`;
```

(The guide is ~4,000 characters, inside `validateManifest`'s 500–20,000 range.)

- [ ] **Step 3: The manifest.** In `convex/showcase/manifest.ts`, add `import { GETTING_STARTED_GUIDE } from "./gettingStartedGuide";` at the top and replace `export const SHOWCASE_NOTEBOOKS: ShowcaseNotebook[] = [];` with the list below. Every URL and licence is the one verified in the Sources appendix; keep the appendix and this list in sync.

```ts
const WIKIPEDIA = "CC BY-SA 4.0 (Wikipedia)";
/** YouTube's "Creative Commons Attribution licence (reuse allowed)" is CC BY 3.0. */
const YOUTUBE_CC_BY = "CC BY 3.0 (YouTube Creative Commons Attribution licence)";
const US_GOV = "Public domain (U.S. federal government work)";

export const SHOWCASE_NOTEBOOKS: ShowcaseNotebook[] = [
  {
    slug: "econ-101-midterm-prep",
    title: "ECON 101 · Midterm Prep",
    icon: "BarChart",
    coverColor: "bg-vintage-blue-300",
    chatMode: "learningGuide",
    sources: [
      { kind: "url", title: "Supply and demand", url: "https://en.wikipedia.org/wiki/Supply_and_demand", licence: WIKIPEDIA },
      { kind: "url", title: "Price elasticity of demand", url: "https://en.wikipedia.org/wiki/Price_elasticity_of_demand", licence: WIKIPEDIA },
      { kind: "url", title: "Perfect competition", url: "https://en.wikipedia.org/wiki/Perfect_competition", licence: WIKIPEDIA },
      { kind: "youtube", title: "Demand and supply: Market Equilibrium (OER Africa)", url: "https://www.youtube.com/watch?v=alH1sJ8VbAY", licence: YOUTUBE_CC_BY },
      { kind: "youtube", title: "Intermediate Microeconomics: Elasticity of Demand (University of Utah, Department of Economics)", url: "https://www.youtube.com/watch?v=zTqTW5n8wxg", licence: YOUTUBE_CC_BY },
    ],
    studio: [
      { kind: "flashcards", cardCount: 55, difficulty: "medium", topic: "Supply and demand, elasticity, surplus and perfect competition for my midterm" },
      { kind: "quiz", questionCount: 20, difficulty: "medium", focus: "Midterm practice: shifts in supply and demand, price elasticity, consumer and producer surplus" },
      { kind: "mindmap" },
      { kind: "audio", audioType: "brief", length: "short", focus: "A quick recap of the main midterm topics for a student revising the night before" },
    ],
  },
  {
    slug: "pharmacology-essentials",
    title: "Pharmacology Essentials",
    icon: "Brain",
    coverColor: "bg-vintage-red-300",
    sources: [
      { kind: "url", title: "Pharmacokinetics", url: "https://en.wikipedia.org/wiki/Pharmacokinetics", licence: WIKIPEDIA },
      { kind: "url", title: "Beta blocker", url: "https://en.wikipedia.org/wiki/Beta_blocker", licence: WIKIPEDIA },
      { kind: "url", title: "What Happens to Medicine in Your Body? (NIGMS)", url: "https://nigms.nih.gov/biobeat/2023/09/what-happens-to-medicine-in-your-body", licence: US_GOV },
      { kind: "url", title: "Drug Interactions: What You Should Know (FDA)", url: "https://www.fda.gov/drugs/resources-drugs/drug-interactions-what-you-should-know", licence: US_GOV },
      { kind: "youtube", title: "Pharmacokinetics Visualized (VetMedAcademy with the MSD Veterinary Manual)", url: "https://www.youtube.com/watch?v=0-fERRXiOzo", licence: YOUTUBE_CC_BY },
    ],
    studio: [
      { kind: "flashcards", cardCount: 55, difficulty: "hard", topic: "Pharmacokinetics, drug classes, mechanisms of action, adverse effects and interactions" },
      { kind: "writtenQuestions", questionCount: 10, difficulty: "medium", questionType: "short", focus: "Explain mechanisms and their clinical implications in two or three sentences" },
      { kind: "audio", audioType: "brief", length: "short", focus: "A short review of ADME and beta blockers for a nursing student" },
    ],
  },
  {
    slug: "spaced-repetition-literature-review",
    title: "Literature Review: Does Spaced Repetition Work?",
    icon: "Search",
    coverColor: "bg-vintage-green-400",
    sources: [],
    paperDiscovery: {
      query: "spaced repetition long-term retention",
      filters: { publicationYearFrom: 2010, minCitations: 10, openAccessOnly: true, hasFullText: true },
      take: 5,
    },
    studio: [],
    literatureReview: {
      question:
        "Does spaced repetition (spreading study or retrieval practice over time) improve long-term retention compared with massed study? Include experiments, classroom studies and meta-analyses with human learners and a retention test at least one day after the last study session. Exclude opinion pieces, app or algorithm descriptions without learner outcomes, and studies where spacing can't be separated from extra study time.",
      researchDatabase: "all",
    },
    deepResearch: {
      query:
        "How should spaced repetition reviews be scheduled (expanding versus fixed intervals, and the best gap for a given test date), and how well do lab findings on the spacing effect hold up in real classrooms?",
      channels: ["notebook", "academic"],
    },
  },
  {
    slug: "llm-hallucinations-paper-digest",
    title: "LLM Hallucinations: Paper Digest",
    icon: "Monitor",
    coverColor: "bg-vintage-blue-500",
    sources: [
      { kind: "url", title: "Survey of Hallucination in Natural Language Generation", url: "https://arxiv.org/abs/2202.03629", licence: "CC BY 4.0 (arXiv)" },
      { kind: "url", title: "SelfCheckGPT: Zero-Resource Black-Box Hallucination Detection for Generative Large Language Models", url: "https://arxiv.org/abs/2303.08896", licence: "CC BY 4.0 (arXiv)" },
      { kind: "url", title: "Semantic Uncertainty: Linguistic Invariances for Uncertainty Estimation in Natural Language Generation", url: "https://arxiv.org/abs/2302.09664", licence: "CC BY 4.0 (arXiv)" },
      { kind: "url", title: "Self-RAG: Learning to Retrieve, Generate, and Critique through Self-Reflection", url: "https://arxiv.org/abs/2310.11511", licence: "CC BY 4.0 (arXiv)" },
      { kind: "url", title: "Fine-grained Hallucination Detection and Editing for Language Models", url: "https://arxiv.org/abs/2401.06855", licence: "CC BY 4.0 (arXiv)" },
      { kind: "youtube", title: "Visualizing LLM Hallucinations (Anand S, FOSSASIA Summit 2025)", url: "https://www.youtube.com/watch?v=FEz3rMwArQs", licence: YOUTUBE_CC_BY },
    ],
    studio: [
      { kind: "spreadsheet", spreadsheetType: "custom", prompt: "Compare the hallucination methods in these papers: one row per method, with columns for the approach, what it needs (model access, retrieval, extra training), how it was evaluated, the headline result and its limitations." },
      { kind: "audio", audioType: "critique", length: "default", focus: "How well each paper's evaluation supports its claims, and what is still unsolved" },
      { kind: "report", reportType: "technical_report", prompt: "A digest of how these papers define, detect and reduce hallucination, with the trade-offs between the methods" },
    ],
  },
  {
    slug: "home-battery-storage-market-scan",
    title: "Home Battery Storage · Market Scan",
    icon: "Globe",
    coverColor: "bg-vintage-amber-400",
    sources: [
      { kind: "url", title: "Solar-Plus-Storage 101 (U.S. DOE)", url: "https://www.energy.gov/cmei/systems/articles/solar-plus-storage-101", licence: US_GOV },
      { kind: "url", title: "California residents are increasingly pairing battery storage with solar installations (EIA)", url: "https://www.eia.gov/todayinenergy/detail.php?id=62524", licence: US_GOV },
      { kind: "url", title: "Energy storage for electricity generation (EIA Energy Explained)", url: "https://www.eia.gov/energyexplained/electricity/energy-storage-for-electricity-generation.php", licence: US_GOV },
      { kind: "youtube", title: "Large-scale battery storage: Challenges and opportunities for technology and policy (video abstract, MRS Energy & Sustainability)", url: "https://www.youtube.com/watch?v=U__l-CFg6wM", licence: YOUTUBE_CC_BY },
    ],
    studio: [
      { kind: "report", reportType: "briefing", prompt: "Brief a founder on the home battery market: how big it is and how fast it is growing, what systems cost, why households buy batteries (backup, solar self-consumption, bill savings) and which policies drive demand" },
      { kind: "spreadsheet", spreadsheetType: "custom", prompt: "A market data table: one row per figure the sources give (installed capacity, annual additions, attachment rate with solar, system size, cost), with columns for the metric, value, unit, year, region and source." },
      { kind: "infographic", prompt: "Home battery storage at a glance: growth, costs and why households pair batteries with solar", orientation: "portrait", detailLevel: "standard" },
    ],
  },
  {
    slug: "reading-a-10-k",
    title: "Reading a 10-K",
    icon: "FileText",
    coverColor: "bg-vintage-orange-300",
    sources: [
      { kind: "url", title: "Costco Wholesale Corporation Form 10-K, fiscal year ended August 30, 2026 (SEC EDGAR)", url: "https://www.sec.gov/Archives/edgar/data/909832/000090983226000093/cost-20260830.htm", licence: "SEC EDGAR public filing (sec.gov: public information, may be copied with citation)" },
    ],
    studio: [
      { kind: "spreadsheet", spreadsheetType: "financial_summary" },
      { kind: "report", reportType: "briefing", prompt: "Explain this 10-K to a business student: what the company does, how it makes money, the key numbers in the income statement, balance sheet and cash flow statement, and the biggest risk factors" },
      { kind: "quiz", questionCount: 10, difficulty: "medium", focus: "Reading a 10-K: the business, the financial statements, MD&A and risk factors" },
    ],
  },
  {
    slug: "getting-started-with-solomindlm",
    title: "Getting Started with SolomindLM",
    icon: "Lightbulb",
    coverColor: "bg-vintage-brown-300",
    sources: [
      { kind: "text", title: "Getting Started with SolomindLM", text: GETTING_STARTED_GUIDE, licence: "Original (SolomindLM)" },
    ],
    studio: [
      { kind: "report", reportType: "study_guide" },
      { kind: "flashcards", cardCount: 20, difficulty: "easy" },
      { kind: "quiz", questionCount: 10, difficulty: "easy" },
      { kind: "writtenQuestions", questionCount: 5, difficulty: "easy", questionType: "short" },
      { kind: "mindmap" },
      { kind: "audio", audioType: "brief", length: "short" },
      { kind: "infographic", prompt: "How a SolomindLM notebook works: add sources, chat with them, create in Studio, share", orientation: "landscape", detailLevel: "concise" },
      { kind: "spreadsheet", spreadsheetType: "custom", prompt: "A table of the Studio tools: one row per tool, with columns for what it makes, the options you can set and when to use it." },
    ],
  },
];
```

Run `bun x biome format --write convex/showcase/manifest.ts` (it will wrap the long lines).

- [ ] **Step 4: Run.** `bun run test:convex -- convex/showcase/manifestValidation.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add convex/showcase/manifest.ts convex/showcase/gettingStartedGuide.ts convex/showcase/manifestValidation.test.ts
git commit -m "feat(showcase): the seven showcase notebooks and the getting started guide"
```

---

## Task 6: The seed state machine

**Files:** Create `convex/showcase/plan.ts`, `convex/showcase/plan.test.ts`

- [ ] **Step 1: Write failing tests.** Create `convex/showcase/plan.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import type { ShowcaseNotebook } from "./manifest";
import { planSeed, type SeedSnapshot } from "./plan";

const NOTEBOOK: ShowcaseNotebook = {
  slug: "test-notebook",
  title: "Test Notebook",
  icon: "Book",
  coverColor: "bg-vintage-blue-300",
  sources: [
    { kind: "url", title: "Page", url: "https://example.org/a", licence: "CC BY-SA 4.0" },
    { kind: "text", title: "Notes", text: "x".repeat(600), licence: "Original" },
  ],
  studio: [
    { kind: "flashcards", cardCount: 35, difficulty: "medium" },
    { kind: "quiz", questionCount: 10, difficulty: "easy" },
    { kind: "flashcards", cardCount: 20, difficulty: "hard" },
  ],
};

const REVIEW_NOTEBOOK: ShowcaseNotebook = {
  slug: "review",
  title: "Review",
  icon: "Search",
  coverColor: "bg-vintage-green-400",
  sources: [],
  paperDiscovery: { query: "spacing effect", filters: {}, take: 2 },
  studio: [],
  literatureReview: { question: "Does spacing work?", researchDatabase: "all" },
  deepResearch: { query: "How should reviews be scheduled?", channels: ["notebook", "academic"] },
};

const EMPTY: SeedSnapshot = {
  notebookExists: true,
  isPublic: false,
  isFeatured: false,
  sources: [],
  studio: [],
  literatureReview: null,
  deepResearch: null,
};

const READY_SOURCES: SeedSnapshot["sources"] = [
  { key: "https://example.org/a", title: "Page", fileType: "url", status: "completed" },
  { key: "Notes", title: "Notes", fileType: "text", status: "completed" },
];

const PAPERS: SeedSnapshot["sources"] = [
  { key: "doi:10.1/a", title: "Paper A", fileType: "paper_record", status: "completed" },
  { key: "doi:10.1/b", title: "Paper B", fileType: "paper_record", status: "completed" },
];

const done = (kind: "flashcards" | "quiz", title = kind) => ({ kind, title, status: "completed" });
const opts = { maxInFlight: 2, publish: false };

describe("planSeed: notebook and sources", () => {
  test("creates the notebook first", () => {
    expect(planSeed(NOTEBOOK, { ...EMPTY, notebookExists: false }, opts)).toEqual({
      state: "working",
      steps: [{ type: "createNotebook" }],
      waitingOn: [],
      problems: [],
    });
  });

  test("adds missing sources and generates nothing until every source is read", () => {
    const plan = planSeed(
      NOTEBOOK,
      { ...EMPTY, sources: [{ ...READY_SOURCES[0], status: "processing" }] },
      opts
    );
    expect(plan.steps).toEqual([{ type: "addSource", sourceIndex: 1 }]);
    expect(plan.waitingOn).toEqual(["1 source(s) ingesting"]);
  });

  test("a failed source blocks generation", () => {
    const plan = planSeed(
      NOTEBOOK,
      { ...EMPTY, sources: [{ ...READY_SOURCES[0], status: "failed" }, READY_SOURCES[1]] },
      opts
    );
    expect(plan.state).toBe("blocked");
    expect(plan.problems).toEqual([
      'Source "Page" failed to ingest. Delete it in the app, then re-run the seed.',
    ]);
  });

  test("discovers the papers still missing", () => {
    const plan = planSeed(REVIEW_NOTEBOOK, { ...EMPTY, sources: [PAPERS[0]] }, opts);
    expect(plan.steps).toEqual([{ type: "discoverPapers", needed: 1 }]);
  });
});

describe("planSeed: Studio items", () => {
  test("starts items in manifest order up to maxInFlight", () => {
    const plan = planSeed(NOTEBOOK, { ...EMPTY, sources: READY_SOURCES }, opts);
    expect(plan.steps).toEqual([
      { type: "startStudioItem", itemIndex: 0 },
      { type: "startStudioItem", itemIndex: 1 },
    ]);
    expect(plan.waitingOn).toEqual(["1 item(s) queued behind running jobs"]);
  });

  test("running items use up slots", () => {
    const plan = planSeed(
      NOTEBOOK,
      {
        ...EMPTY,
        sources: READY_SOURCES,
        studio: [{ kind: "flashcards", title: "Flashcards", status: "generating" }],
      },
      opts
    );
    expect(plan.steps).toEqual([{ type: "startStudioItem", itemIndex: 1 }]);
    expect(plan.waitingOn).toEqual([
      'flashcards "Flashcards" generating',
      "1 item(s) queued behind running jobs",
    ]);
  });

  test("matches items of a kind by count, so finished items are never restarted", () => {
    const plan = planSeed(
      NOTEBOOK,
      {
        ...EMPTY,
        sources: READY_SOURCES,
        studio: [done("flashcards", "Deck 1"), done("quiz"), done("flashcards", "Deck 2")],
      },
      opts
    );
    expect(plan).toEqual({ state: "done", steps: [], waitingOn: [], problems: [] });
  });

  test("a failed item is reported and not retried", () => {
    const plan = planSeed(
      NOTEBOOK,
      {
        ...EMPTY,
        sources: READY_SOURCES,
        studio: [
          { kind: "flashcards", title: "Deck 1", status: "failed" },
          done("quiz"),
          done("flashcards", "Deck 2"),
        ],
      },
      opts
    );
    expect(plan.state).toBe("blocked");
    expect(plan.steps).toEqual([]);
    expect(plan.problems).toEqual([
      'flashcards "Deck 1" failed. Delete it in the app, then re-run the seed.',
    ]);
  });

  test("publishes a finished notebook only when asked, and only once", () => {
    const finished: SeedSnapshot = {
      ...EMPTY,
      sources: READY_SOURCES,
      studio: [done("flashcards"), done("quiz"), done("flashcards")],
    };
    expect(planSeed(NOTEBOOK, finished, { ...opts, publish: true }).steps).toEqual([
      { type: "publish" },
    ]);
    expect(
      planSeed(NOTEBOOK, { ...finished, isPublic: true, isFeatured: true }, { ...opts, publish: true })
        .state
    ).toBe("done");
  });
});

describe("planSeed: literature review and deep research", () => {
  const withPapers = { ...EMPTY, sources: PAPERS };
  const review = (status: string, extra: Partial<NonNullable<SeedSnapshot["literatureReview"]>> = {}) => ({
    status,
    awaitingColumns: false,
    outputsInStudio: false,
    ...extra,
  });

  test("starts the review once the papers are read; deep research waits for it", () => {
    const plan = planSeed(REVIEW_NOTEBOOK, withPapers, opts);
    expect(plan.steps).toEqual([{ type: "startLiteratureReview" }]);
    expect(plan.waitingOn).toEqual(["deep research: waiting for the literature review"]);
  });

  test("confirms the suggested columns only when the workflow is waiting for them", () => {
    const waiting = planSeed(
      REVIEW_NOTEBOOK,
      { ...withPapers, literatureReview: review("awaiting_columns", { awaitingColumns: true }) },
      opts
    );
    expect(waiting.steps).toEqual([{ type: "confirmLiteratureReviewColumns" }]);
    const notYet = planSeed(
      REVIEW_NOTEBOOK,
      { ...withPapers, literatureReview: review("awaiting_columns") },
      opts
    );
    expect(notYet.steps).toEqual([]);
    expect(notYet.waitingOn).toContain("literature review: awaiting_columns");
  });

  test("copies a finished review into Studio, then starts deep research", () => {
    expect(
      planSeed(REVIEW_NOTEBOOK, { ...withPapers, literatureReview: review("completed") }, opts).steps
    ).toEqual([{ type: "copyLiteratureReviewToStudio" }]);
    expect(
      planSeed(
        REVIEW_NOTEBOOK,
        { ...withPapers, literatureReview: review("completed", { outputsInStudio: true }) },
        opts
      ).steps
    ).toEqual([{ type: "startDeepResearch" }]);
  });

  test("a failed review blocks the notebook", () => {
    const plan = planSeed(REVIEW_NOTEBOOK, { ...withPapers, literatureReview: review("failed") }, opts);
    expect(plan.state).toBe("blocked");
    expect(plan.problems).toEqual([
      "The literature review failed. Retry it from the notebook's chat, then re-run the seed.",
    ]);
  });

  test("approves the research plan, then waits for the report", () => {
    const base = { ...withPapers, literatureReview: review("completed", { outputsInStudio: true }) };
    expect(
      planSeed(
        REVIEW_NOTEBOOK,
        { ...base, deepResearch: { planStatus: "draft", awaitingApproval: true, runStatus: "pending", hasReport: false } },
        opts
      ).steps
    ).toEqual([{ type: "approveDeepResearchPlan" }]);
    expect(
      planSeed(
        REVIEW_NOTEBOOK,
        { ...base, deepResearch: { planStatus: "approved", awaitingApproval: false, runStatus: "completed", hasReport: true } },
        opts
      ).state
    ).toBe("done");
    expect(
      planSeed(
        REVIEW_NOTEBOOK,
        { ...base, deepResearch: { planStatus: "approved", awaitingApproval: false, runStatus: "completed", hasReport: false } },
        opts
      ).state
    ).toBe("blocked");
  });
});
```

- [ ] **Step 2: Run, expect failure.** `bun run test:convex -- convex/showcase/plan.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement.** Create `convex/showcase/plan.ts`:

```ts
/**
 * The seed's state machine. `planSeed` compares one manifest notebook with a snapshot of what the
 * database holds and returns the next steps. Pure, so it is unit-tested; `db.ts` builds the
 * snapshot and runs the steps, `seed.ts` calls it once per tick.
 */
import { type Infer, v } from "convex/values";
import { type ShowcaseNotebook, type StudioKind, sourceKey } from "./manifest";

/** Jobs one notebook runs at once, unless the caller passes `maxInFlight`. */
export const DEFAULT_MAX_IN_FLIGHT = 2;

export interface SeedSnapshot {
  notebookExists: boolean;
  isPublic: boolean;
  isFeatured: boolean;
  /** The notebook's documents; `key` matches `sourceKey` (or `paperKey` for papers). */
  sources: Array<{ key: string; title: string; fileType: string; status: string }>;
  /** The notebook's Studio rows, every kind. */
  studio: Array<{ kind: StudioKind; title: string; status: string }>;
  /** The latest literature review session. */
  literatureReview: null | {
    status: string;
    /** The workflow is paused in `awaitEvent` for the column confirmation. */
    awaitingColumns: boolean;
    /** A Studio copy of the session's table and report exists. */
    outputsInStudio: boolean;
  };
  /** The latest deep-research plan and its run. */
  deepResearch: null | {
    planStatus: string;
    /** The workflow is paused in `awaitEvent` for plan approval. */
    awaitingApproval: boolean;
    runStatus?: string;
    hasReport: boolean;
  };
}

export const seedStepValidator = v.union(
  v.object({ type: v.literal("createNotebook") }),
  v.object({ type: v.literal("addSource"), sourceIndex: v.number() }),
  v.object({ type: v.literal("discoverPapers"), needed: v.number() }),
  v.object({ type: v.literal("startStudioItem"), itemIndex: v.number() }),
  v.object({ type: v.literal("startLiteratureReview") }),
  v.object({ type: v.literal("confirmLiteratureReviewColumns") }),
  v.object({ type: v.literal("copyLiteratureReviewToStudio") }),
  v.object({ type: v.literal("startDeepResearch") }),
  v.object({ type: v.literal("approveDeepResearchPlan") }),
  v.object({ type: v.literal("publish") })
);

export type SeedStep = Infer<typeof seedStepValidator>;

export const seedPlanValidator = v.object({
  state: v.union(v.literal("working"), v.literal("blocked"), v.literal("done")),
  steps: v.array(seedStepValidator),
  waitingOn: v.array(v.string()),
  problems: v.array(v.string()),
});

export type SeedPlan = Infer<typeof seedPlanValidator>;

export interface PlanOptions {
  maxInFlight: number;
  publish: boolean;
}

const COMPLETED = "completed";
const FAILED = "failed";
const isFinished = (status: string) => status === COMPLETED || status === FAILED;

function researchFailed(r: NonNullable<SeedSnapshot["deepResearch"]>): boolean {
  return (
    r.planStatus === "failed" ||
    r.planStatus === "rejected" ||
    r.runStatus === "failed" ||
    r.runStatus === "cancelled"
  );
}

export function planSeed(
  notebook: ShowcaseNotebook,
  snap: SeedSnapshot,
  options: PlanOptions
): SeedPlan {
  const steps: SeedStep[] = [];
  const waitingOn: string[] = [];
  const problems: string[] = [];
  const result = (): SeedPlan => ({
    state:
      steps.length > 0 || waitingOn.length > 0
        ? "working"
        : problems.length > 0
          ? "blocked"
          : "done",
    steps,
    waitingOn,
    problems,
  });

  if (!snap.notebookExists) {
    steps.push({ type: "createNotebook" });
    return result();
  }

  // 1. Sources. Nothing is generated until every source has been read.
  const keys = new Set(snap.sources.map((s) => s.key));
  notebook.sources.forEach((source, sourceIndex) => {
    if (!keys.has(sourceKey(source))) steps.push({ type: "addSource", sourceIndex });
  });
  if (notebook.paperDiscovery) {
    const papers = snap.sources.filter((s) => s.fileType === "paper_record").length;
    if (papers < notebook.paperDiscovery.take) {
      steps.push({ type: "discoverPapers", needed: notebook.paperDiscovery.take - papers });
    }
  }
  const ingesting = snap.sources.filter((s) => !isFinished(s.status)).length;
  if (ingesting > 0) waitingOn.push(`${ingesting} source(s) ingesting`);
  for (const s of snap.sources) {
    if (s.status === FAILED) {
      problems.push(`Source "${s.title}" failed to ingest. Delete it in the app, then re-run the seed.`);
    }
  }
  if (steps.length > 0 || waitingOn.length > 0 || problems.length > 0) return result();

  // 2. Jobs already running use up slots.
  let inFlight = 0;
  for (const row of snap.studio) {
    if (row.status === FAILED) {
      problems.push(`${row.kind} "${row.title}" failed. Delete it in the app, then re-run the seed.`);
    } else if (row.status !== COMPLETED) {
      inFlight++;
      waitingOn.push(`${row.kind} "${row.title}" generating`);
    }
  }
  const review = snap.literatureReview;
  if (review && !isFinished(review.status)) inFlight++;
  const research = snap.deepResearch;
  if (research && !researchFailed(research) && research.runStatus !== COMPLETED) inFlight++;
  let queued = 0;
  const takeSlot = (): boolean => {
    if (inFlight < options.maxInFlight) {
      inFlight++;
      return true;
    }
    queued++;
    return false;
  };

  // 3. Studio items. The n-th item of a kind is started while fewer than n+1 rows of that kind
  // exist. Failed rows count too, so a failed item is only retried after someone deletes it.
  const rowsOfKind = new Map<StudioKind, number>();
  for (const row of snap.studio) rowsOfKind.set(row.kind, (rowsOfKind.get(row.kind) ?? 0) + 1);
  const ordinals = new Map<StudioKind, number>();
  notebook.studio.forEach((item, itemIndex) => {
    const ordinal = ordinals.get(item.kind) ?? 0;
    ordinals.set(item.kind, ordinal + 1);
    if (ordinal < (rowsOfKind.get(item.kind) ?? 0)) return;
    if (takeSlot()) steps.push({ type: "startStudioItem", itemIndex });
  });

  // 4. Literature review, then deep research (it starts once the review is in Studio).
  if (notebook.literatureReview) {
    if (!review) {
      if (takeSlot()) steps.push({ type: "startLiteratureReview" });
    } else if (review.awaitingColumns) {
      steps.push({ type: "confirmLiteratureReviewColumns" });
    } else if (review.status === FAILED) {
      problems.push("The literature review failed. Retry it from the notebook's chat, then re-run the seed.");
    } else if (review.status === COMPLETED) {
      if (!review.outputsInStudio) steps.push({ type: "copyLiteratureReviewToStudio" });
    } else {
      waitingOn.push(`literature review: ${review.status}`);
    }
  }
  if (notebook.deepResearch) {
    const reviewDone =
      !notebook.literatureReview || (review?.status === COMPLETED && review.outputsInStudio);
    if (!research) {
      if (!reviewDone) {
        if (review?.status !== FAILED) waitingOn.push("deep research: waiting for the literature review");
      } else if (takeSlot()) {
        steps.push({ type: "startDeepResearch" });
      }
    } else if (researchFailed(research)) {
      problems.push(
        "Deep research failed. Retry it from the notebook's chat (or delete that chat thread), then re-run the seed."
      );
    } else if (research.awaitingApproval) {
      steps.push({ type: "approveDeepResearchPlan" });
    } else if (research.runStatus === COMPLETED) {
      if (!research.hasReport) {
        problems.push(
          "Deep research finished without a report. Delete its chat thread in the app, then re-run the seed."
        );
      }
    } else {
      waitingOn.push(`deep research: ${research.runStatus ?? research.planStatus}`);
    }
  }
  if (queued > 0) waitingOn.push(`${queued} item(s) queued behind running jobs`);

  // 5. Publish once nothing is left.
  if (
    options.publish &&
    steps.length === 0 &&
    waitingOn.length === 0 &&
    problems.length === 0 &&
    (!snap.isPublic || !snap.isFeatured)
  ) {
    steps.push({ type: "publish" });
  }
  return result();
}
```

- [ ] **Step 4: Run.** `bun run test:convex -- convex/showcase/plan.test.ts`. Expected: PASS. (Check: in "starts the review once the papers are read" the review takes the first slot and deep research only adds a waiting line; in "approves the research plan" the awaiting plan takes one slot, which is fine.)

- [ ] **Step 5: Commit.**

```bash
git add convex/showcase/plan.ts convex/showcase/plan.test.ts
git commit -m "feat(showcase): seed state machine"
```

---

## Task 7: Discovered-paper helpers

**Files:** Create `convex/showcase/papers.ts`, `convex/showcase/papers.test.ts`

- [ ] **Step 1: Write failing tests.** Create `convex/showcase/papers.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { paperKey, pickDiscoveredPapers, type ResolvedPaper } from "./papers";

const paper = (title: string, doi?: string, license?: string): ResolvedPaper => ({
  title,
  paperRecord: { abstract: "…", authors: ["A. Author"], doi, isOa: true, license },
});

describe("paperKey", () => {
  test("uses the DOI, normalised, else the title", () => {
    expect(paperKey(paper("X", "https://doi.org/10.1371/Journal.pone.1"))).toBe(
      "doi:10.1371/journal.pone.1"
    );
    expect(paperKey(paper("  A Title "))).toBe("title:a title");
  });
});

describe("pickDiscoveredPapers", () => {
  test("prefers openly licensed papers, keeps discovery order otherwise, skips ones already added", () => {
    const picked = pickDiscoveredPapers(
      [
        paper("Closed 1", "10.1/c1"),
        paper("Open 1", "10.1/o1", "https://creativecommons.org/licenses/by/4.0/"),
        paper("Already added", "10.1/old", "cc-by"),
        paper("NC", "10.1/nc", "cc-by-nc"),
        paper("Open 2", "10.1/o2", "cc-by"),
        paper("Closed 1 again", "10.1/C1"),
      ],
      new Set(["doi:10.1/old"]),
      3
    );
    expect(picked.map((p) => p.title)).toEqual(["Open 1", "Open 2", "Closed 1"]);
  });

  test("returns nothing when nothing is needed", () => {
    expect(pickDiscoveredPapers([paper("A", "10.1/a")], new Set(), 0)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, expect failure.** `bun run test:convex -- convex/showcase/papers.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement.** Create `convex/showcase/papers.ts`:

```ts
import { isOpenFullTextLicense } from "../documents/paperIngest";
import { normalizeDoi, type PaperRecord } from "../documents/paperRecord";

export interface ResolvedPaper {
  title: string;
  paperRecord: PaperRecord;
}

/** How a paper source is matched: its DOI, else its title (case-insensitive). */
export function paperKey(paper: { title: string; paperRecord?: { doi?: string } }): string {
  const doi = normalizeDoi(paper.paperRecord?.doi)?.toLowerCase();
  return doi ? `doi:${doi}` : `title:${paper.title.trim().toLowerCase()}`;
}

/**
 * The papers to add: not already in the notebook, openly licensed ones first (their full text can
 * be published), otherwise in discovery order.
 */
export function pickDiscoveredPapers(
  candidates: ResolvedPaper[],
  existingKeys: ReadonlySet<string>,
  needed: number
): ResolvedPaper[] {
  const seen = new Set(existingKeys);
  const fresh: ResolvedPaper[] = [];
  for (const candidate of candidates) {
    const key = paperKey(candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    fresh.push(candidate);
  }
  const isOpen = (p: ResolvedPaper) => isOpenFullTextLicense(p.paperRecord.license);
  return [...fresh.filter(isOpen), ...fresh.filter((p) => !isOpen(p))].slice(0, Math.max(0, needed));
}
```

- [ ] **Step 4: Run.** `bun run test:convex -- convex/showcase/papers.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add convex/showcase/papers.ts convex/showcase/papers.test.ts
git commit -m "feat(showcase): discovered paper selection"
```

---

## Task 8: Snapshot, notebook, source and Studio mutations

**Files:** Create `convex/showcase/db.ts`, `convex/showcase/db.test.ts`

- [ ] **Step 1: Write failing tests.** Create `convex/showcase/db.test.ts`:

```ts
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { SHOWCASE_FOLDER_NAME, SHOWCASE_NOTEBOOKS } from "./manifest";

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);

const OWNER = "maintainer@example.com";
const bySlug = (slug: string) => {
  const notebook = SHOWCASE_NOTEBOOKS.find((n) => n.slug === slug);
  if (!notebook) throw new Error(`missing ${slug}`);
  return notebook;
};
const GUIDE = bySlug("getting-started-with-solomindlm");
const ECON = bySlug("econ-101-midterm-prep");
const TEN_K = bySlug("reading-a-10-k");
const REVIEW = bySlug("spaced-repetition-literature-review");
const ref = (slug: string) => ({ ownerEmail: OWNER, slug });

// Keep scheduled jobs (docEmbedding, Studio generation) from running: they call external services.
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

type T = ReturnType<typeof convexTest>;

async function setup() {
  const t = convexTest(schema, modules);
  const ownerId = await t.run((ctx) => ctx.db.insert("users", { email: OWNER, name: "Maintainer" }));
  return { t, ownerId };
}

async function markSourcesRead(t: T, notebookId: Id<"notebooks">) {
  await t.run(async (ctx) => {
    const docs = await ctx.db
      .query("documents")
      .withIndex("by_notebook", (q) => q.eq("notebookId", notebookId))
      .collect();
    for (const d of docs) await ctx.db.patch(d._id, { status: "completed" });
  });
}

async function status(t: T, slug: string) {
  const [row] = await t.query(internal.showcase.db.seedStatus, { ownerEmail: OWNER, slug });
  return row;
}

describe("showcase db", () => {
  test("refuses an owner email with no account", async () => {
    const { t } = await setup();
    await expect(
      t.mutation(internal.showcase.db.ensureNotebook, { ownerEmail: "nobody@example.com", slug: GUIDE.slug })
    ).rejects.toThrow("No user with email nobody@example.com");
  });

  test("creates the notebook once, in the Showcase folder, with the manifest's chat mode", async () => {
    const { t, ownerId } = await setup();
    const first = await t.mutation(internal.showcase.db.ensureNotebook, ref(ECON.slug));
    const second = await t.mutation(internal.showcase.db.ensureNotebook, ref(ECON.slug));
    expect(second).toBe(first);
    const { notebook, folders } = await t.run(async (ctx) => ({
      notebook: await ctx.db.get(first),
      folders: await ctx.db.query("folders").withIndex("by_user", (q) => q.eq("userId", ownerId)).collect(),
    }));
    expect(notebook).toMatchObject({ title: ECON.title, userId: ownerId, icon: ECON.icon });
    expect(notebook?.chatSettings?.instructionMode).toBe("learningGuide");
    expect(folders.map((f) => f.name)).toEqual([SHOWCASE_FOLDER_NAME]);
  });

  test("adds a source once and schedules its ingestion", async () => {
    const { t } = await setup();
    const notebookId = await t.mutation(internal.showcase.db.ensureNotebook, ref(GUIDE.slug));
    const first = await t.mutation(internal.showcase.db.addSource, { ...ref(GUIDE.slug), sourceIndex: 0 });
    const again = await t.mutation(internal.showcase.db.addSource, { ...ref(GUIDE.slug), sourceIndex: 0 });
    expect(first).not.toBeNull();
    expect(again).toBeNull();
    const { docs, scheduled } = await t.run(async (ctx) => ({
      docs: await ctx.db.query("documents").withIndex("by_notebook", (q) => q.eq("notebookId", notebookId)).collect(),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
    }));
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ fileType: "text", fileName: GUIDE.sources[0].kind === "text" ? GUIDE.sources[0].title : "", status: "pending" });
    expect(scheduled.filter((s) => s.name.includes("embeddingJob"))).toHaveLength(1);
  });

  test("seedStatus walks the plan: sources first, then Studio items", async () => {
    const { t } = await setup();
    expect((await status(t, GUIDE.slug)).nextSteps).toEqual(["createNotebook"]);
    const notebookId = await t.mutation(internal.showcase.db.ensureNotebook, ref(GUIDE.slug));
    expect((await status(t, GUIDE.slug)).nextSteps).toEqual(["addSource"]);
    await t.mutation(internal.showcase.db.addSource, { ...ref(GUIDE.slug), sourceIndex: 0 });
    expect((await status(t, GUIDE.slug)).waitingOn).toEqual(["1 source(s) ingesting"]);
    await markSourcesRead(t, notebookId);
    expect((await status(t, GUIDE.slug)).nextSteps).toEqual(["startStudioItem", "startStudioItem"]);
  });

  test("starts each Studio item once and never restarts a failed one", async () => {
    const { t } = await setup();
    const notebookId = await t.mutation(internal.showcase.db.ensureNotebook, ref(GUIDE.slug));
    await t.mutation(internal.showcase.db.addSource, { ...ref(GUIDE.slug), sourceIndex: 0 });
    await markSourcesRead(t, notebookId);

    const reportId = await t.mutation(internal.showcase.db.startStudioItem, { ...ref(GUIDE.slug), itemIndex: 0 });
    expect(reportId).not.toBeNull();
    expect(await t.mutation(internal.showcase.db.startStudioItem, { ...ref(GUIDE.slug), itemIndex: 0 })).toBeNull();

    await t.run((ctx) => ctx.db.patch(reportId as Id<"reports">, { status: "failed" }));
    expect(await t.mutation(internal.showcase.db.startStudioItem, { ...ref(GUIDE.slug), itemIndex: 0 })).toBeNull();
    const reports = await t.run((ctx) =>
      ctx.db.query("reports").withIndex("by_notebook", (q) => q.eq("notebookId", notebookId)).collect()
    );
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ reportType: "study_guide" });
    expect((await status(t, GUIDE.slug)).problems).toEqual([
      'report "Report" failed. Delete it in the app, then re-run the seed.',
    ]);
  });

  test("adds discovered papers up to the manifest count, with the open-licence policy", async () => {
    const { t } = await setup();
    const notebookId = await t.mutation(internal.showcase.db.ensureNotebook, ref(REVIEW.slug));
    const take = REVIEW.paperDiscovery?.take ?? 0;
    const papers = Array.from({ length: take + 1 }, (_, i) => ({
      title: `Paper ${i}`,
      paperRecord: { abstract: "An abstract.", authors: ["A. Author"], doi: `10.1/p${i}`, isOa: true },
    }));
    const added = await t.mutation(internal.showcase.db.addDiscoveredPapers, {
      ...ref(REVIEW.slug),
      papers: [papers[0], ...papers],
    });
    expect(added).toBe(take);
    const docs = await t.run((ctx) =>
      ctx.db.query("documents").withIndex("by_notebook", (q) => q.eq("notebookId", notebookId)).collect()
    );
    expect(docs).toHaveLength(take);
    for (const doc of docs) {
      expect(doc).toMatchObject({ fileType: "paper_record", fullTextPolicy: "open_license_only", status: "pending" });
    }
  });
});
```

- [ ] **Step 2: Run, expect failure.** `bun run test:convex -- convex/showcase/db.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement the read side.** Create `convex/showcase/db.ts`:

```ts
/**
 * Database side of the showcase seed (`seed.ts`). Internal only. Every mutation finds the owner by
 * email and the notebook by title in the owner's Showcase folder, and re-checks what exists inside
 * its own transaction, so steps can be repeated safely.
 */
import { v } from "convex/values";
import { SPREADSHEET_PRESET_REQUESTS } from "../_agents/spreadsheet/presetRequests";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "../_generated/server";
import { assertCanEditNotebook } from "../_lib/notebookAccess";
import { TEXT_TITLE_MAX_LENGTH } from "../_lib/textTitle";
import * as AudioOverviews from "../_model/audioOverviews";
import * as Flashcards from "../_model/flashcards";
import * as Infographics from "../_model/infographics";
import {
  getChatLinkedLiteratureArtifactIds,
  isChatLiteratureReport,
  isChatLiteratureTable,
} from "../_model/literatureArtifacts";
import * as Mindmaps from "../_model/mindmaps";
import * as Notebooks from "../_model/notebooks";
import * as Quizzes from "../_model/quizzes";
import * as Reports from "../_model/reports";
import * as Spreadsheets from "../_model/spreadsheets";
import * as WrittenQuestions from "../_model/writtenQuestions";
import { deriveFulltextStatus, paperRecordValidator, primaryLinkUrlForPaper } from "../documents/paperRecord";
import {
  SHOWCASE_FOLDER_NAME,
  SHOWCASE_NOTEBOOKS,
  STUDIO_KINDS,
  type ShowcaseNotebook,
  type ShowcaseStudioItem,
  type StudioKind,
  sourceKey,
} from "./manifest";
import { paperKey } from "./papers";
import { DEFAULT_MAX_IN_FLIGHT, planSeed, type SeedSnapshot, seedPlanValidator } from "./plan";

type Reader = QueryCtx["db"];

/** Read caps: a showcase notebook holds a handful of sources and Studio items. */
const MAX_ROWS = 100;

const ownerSlugArgs = { ownerEmail: v.string(), slug: v.string() };

function showcaseNotebookBySlug(slug: string): ShowcaseNotebook {
  const notebook = SHOWCASE_NOTEBOOKS.find((n) => n.slug === slug);
  if (!notebook) {
    const known = SHOWCASE_NOTEBOOKS.map((n) => n.slug).join(", ");
    throw new Error(`No showcase notebook "${slug}". Known: ${known}`);
  }
  return notebook;
}

async function ownerByEmail(db: Reader, email: string): Promise<Doc<"users">> {
  const user = await db
    .query("users")
    .withIndex("email", (q) => q.eq("email", email.trim()))
    .first();
  if (!user) {
    throw new Error(`No user with email ${email} on this deployment. Sign up with it first.`);
  }
  return user;
}

async function findShowcaseFolder(db: Reader, userId: Id<"users">): Promise<Doc<"folders"> | null> {
  for await (const folder of db.query("folders").withIndex("by_user", (q) => q.eq("userId", userId))) {
    if (folder.name === SHOWCASE_FOLDER_NAME) return folder;
  }
  return null;
}

async function findShowcaseNotebook(
  db: Reader,
  userId: Id<"users">,
  title: string
): Promise<Doc<"notebooks"> | null> {
  const folder = await findShowcaseFolder(db, userId);
  if (!folder) return null;
  for await (const notebook of db
    .query("notebooks")
    .withIndex("by_folder", (q) => q.eq("folderId", folder._id))) {
    if (notebook.userId === userId && notebook.title === title) return notebook;
  }
  return null;
}

async function requireShowcaseNotebook(ctx: QueryCtx, ownerEmail: string, slug: string) {
  const spec = showcaseNotebookBySlug(slug);
  const owner = await ownerByEmail(ctx.db, ownerEmail);
  const notebook = await findShowcaseNotebook(ctx.db, owner._id, spec.title);
  if (!notebook) throw new Error(`"${spec.title}" doesn't exist yet; run the seed from the start.`);
  return { spec, owner, notebook };
}

async function listDocuments(db: Reader, notebookId: Id<"notebooks">) {
  return await db
    .query("documents")
    .withIndex("by_notebook", (q) => q.eq("notebookId", notebookId))
    .take(MAX_ROWS);
}

function documentKey(doc: Doc<"documents">): string {
  if (doc.fileType === "paper_record") return paperKey({ title: doc.fileName, paperRecord: doc.paperRecord });
  if (doc.fileType === "url" || doc.fileType === "youtube") return doc.fileUrl ?? doc.fileName;
  return doc.fileName;
}

type StudioRow = { status: string; title: string };

/** The owner's rows of one Studio kind (rows saved from a literature table/report don't count). */
async function studioRows(
  db: Reader,
  kind: StudioKind,
  notebookId: Id<"notebooks">,
  userId: Id<"users">
): Promise<StudioRow[]> {
  switch (kind) {
    case "report":
      return (
        await db
          .query("reports")
          .withIndex("by_notebook_and_user", (q) => q.eq("notebookId", notebookId).eq("userId", userId))
          .take(MAX_ROWS)
      ).filter((r) => !r.metadata?.sourceLiteratureReportId);
    case "flashcards":
      return await db
        .query("flashcards")
        .withIndex("by_notebook_and_user", (q) => q.eq("notebookId", notebookId).eq("userId", userId))
        .take(MAX_ROWS);
    case "quiz":
      return await db
        .query("quizzes")
        .withIndex("by_notebook_and_user", (q) => q.eq("notebookId", notebookId).eq("userId", userId))
        .take(MAX_ROWS);
    case "writtenQuestions":
      return await db
        .query("writtenQuestions")
        .withIndex("by_notebook_and_user", (q) => q.eq("notebookId", notebookId).eq("userId", userId))
        .take(MAX_ROWS);
    case "mindmap":
      return await db
        .query("mindmaps")
        .withIndex("by_notebook_and_user", (q) => q.eq("notebookId", notebookId).eq("userId", userId))
        .take(MAX_ROWS);
    case "audio":
      return await db
        .query("audioOverviews")
        .withIndex("by_notebook_and_user", (q) => q.eq("notebookId", notebookId).eq("userId", userId))
        .take(MAX_ROWS);
    case "infographic":
      return await db
        .query("infographics")
        .withIndex("by_notebook_and_user", (q) => q.eq("notebookId", notebookId).eq("userId", userId))
        .take(MAX_ROWS);
    case "spreadsheet":
      return (
        await db
          .query("spreadsheets")
          .withIndex("by_notebook_and_user", (q) => q.eq("notebookId", notebookId).eq("userId", userId))
          .take(MAX_ROWS)
      ).filter((r) => !r.metadata?.sourceLiteratureTableId);
  }
}

/** True while a workflow is paused in `awaitEvent` (its tracked "awaiting_user_input" step is open). */
async function isAwaitingUserInput(db: Reader, researchId: string): Promise<boolean> {
  const step = await db
    .query("researchSteps")
    .withIndex("by_research_step", (q) => q.eq("researchId", researchId).eq("stepType", "awaiting_user_input"))
    .first();
  return step?.status === "in_progress";
}

async function latestReviewSession(db: Reader, notebookId: Id<"notebooks">) {
  return await db
    .query("literatureReviewSessions")
    .withIndex("by_notebook", (q) => q.eq("notebookId", notebookId))
    .order("desc")
    .first();
}

/** A Studio-visible table and report with the session's titles exist. */
async function reviewOutputsInStudio(
  ctx: QueryCtx,
  session: Doc<"literatureReviewSessions">
): Promise<boolean> {
  if (!session.tableId || !session.reportId) return false;
  const table = await ctx.db.get(session.tableId);
  const report = await ctx.db.get(session.reportId);
  if (!table || !report) return false;
  const chat = await getChatLinkedLiteratureArtifactIds(ctx, session.notebookId);
  const tables = await ctx.db
    .query("literatureTables")
    .withIndex("by_notebook", (q) => q.eq("notebookId", session.notebookId))
    .take(MAX_ROWS);
  const reports = await ctx.db
    .query("literatureReports")
    .withIndex("by_notebook", (q) => q.eq("notebookId", session.notebookId))
    .take(MAX_ROWS);
  return (
    tables.some((t) => t.title === table.title && !isChatLiteratureTable(t, chat.tableIds)) &&
    reports.some((r) => r.title === report.title && !isChatLiteratureReport(r, chat.reportIds))
  );
}

/** The owner's newest deep-research plan in this notebook (plans hang off conversations). */
async function latestResearchPlan(
  db: Reader,
  notebookId: Id<"notebooks">,
  userId: Id<"users">
): Promise<Doc<"researchPlans"> | null> {
  let latest: Doc<"researchPlans"> | null = null;
  const conversations = await db
    .query("conversations")
    .withIndex("by_notebook", (q) => q.eq("notebookId", notebookId))
    .take(MAX_ROWS);
  for (const conversation of conversations) {
    if (conversation.userId !== userId) continue;
    const plans = await db
      .query("researchPlans")
      .withIndex("by_conversation", (q) => q.eq("conversationId", conversation._id))
      .take(MAX_ROWS);
    for (const plan of plans) {
      if (plan.notebookId === notebookId && (!latest || plan.createdAt > latest.createdAt)) latest = plan;
    }
  }
  return latest;
}

const EMPTY_SNAPSHOT: SeedSnapshot = {
  notebookExists: false,
  isPublic: false,
  isFeatured: false,
  sources: [],
  studio: [],
  literatureReview: null,
  deepResearch: null,
};

async function loadSeedState(ctx: QueryCtx, ownerEmail: string, slug: string) {
  const spec = showcaseNotebookBySlug(slug);
  const owner = await ownerByEmail(ctx.db, ownerEmail);
  const notebook = await findShowcaseNotebook(ctx.db, owner._id, spec.title);
  if (!notebook) return { spec, owner, notebook, snapshot: EMPTY_SNAPSHOT };

  const documents = await listDocuments(ctx.db, notebook._id);
  const studio: SeedSnapshot["studio"] = [];
  for (const kind of STUDIO_KINDS) {
    for (const row of await studioRows(ctx.db, kind, notebook._id, owner._id)) {
      studio.push({ kind, title: row.title, status: row.status });
    }
  }

  const session = await latestReviewSession(ctx.db, notebook._id);
  const plan = await latestResearchPlan(ctx.db, notebook._id, owner._id);
  const run = plan
    ? await ctx.db
        .query("researchRuns")
        .withIndex("by_planId_and_createdAt", (q) => q.eq("planId", plan._id))
        .order("desc")
        .first()
    : null;

  const snapshot: SeedSnapshot = {
    notebookExists: true,
    isPublic: notebook.isPublic === true,
    isFeatured: notebook.isFeatured === true,
    sources: documents.map((d) => ({ key: documentKey(d), title: d.fileName, fileType: d.fileType, status: d.status })),
    studio,
    literatureReview: session
      ? {
          status: session.status,
          awaitingColumns:
            session.status === "awaiting_columns" && (await isAwaitingUserInput(ctx.db, session._id)),
          outputsInStudio: session.status === "completed" && (await reviewOutputsInStudio(ctx, session)),
        }
      : null,
    deepResearch: plan
      ? {
          planStatus: plan.status,
          awaitingApproval: plan.status === "draft" && (await isAwaitingUserInput(ctx.db, plan._id)),
          runStatus: run?.status,
          hasReport: Boolean(run?.reportId),
        }
      : null,
  };
  return { spec, owner, notebook, snapshot };
}

/** Throws unless the owner has an account here. */
export const assertOwner = internalQuery({
  args: { ownerEmail: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ownerByEmail(ctx.db, args.ownerEmail);
    return null;
  },
});

/** What `tick` needs: the plan and the keys of the papers already added. */
export const getSeedState = internalQuery({
  args: { ...ownerSlugArgs, publish: v.boolean(), maxInFlight: v.number() },
  returns: v.object({ plan: seedPlanValidator, paperKeys: v.array(v.string()) }),
  handler: async (ctx, args) => {
    const { spec, snapshot } = await loadSeedState(ctx, args.ownerEmail, args.slug);
    return {
      plan: planSeed(spec, snapshot, { publish: args.publish, maxInFlight: args.maxInFlight }),
      paperKeys: snapshot.sources.filter((s) => s.fileType === "paper_record").map((s) => s.key),
    };
  },
});

/** Progress of every showcase notebook (or one): `npx convex run showcase/db:seedStatus`. */
export const seedStatus = internalQuery({
  args: { ownerEmail: v.string(), slug: v.optional(v.string()) },
  returns: v.array(
    v.object({
      slug: v.string(),
      title: v.string(),
      notebookId: v.union(v.id("notebooks"), v.null()),
      isPublic: v.boolean(),
      state: v.string(),
      nextSteps: v.array(v.string()),
      waitingOn: v.array(v.string()),
      problems: v.array(v.string()),
      /** Paper sources as "doi:… | title", to pin into the manifest after the dev run. */
      papers: v.array(v.string()),
    })
  ),
  handler: async (ctx, args) => {
    const specs = args.slug ? [showcaseNotebookBySlug(args.slug)] : SHOWCASE_NOTEBOOKS;
    const rows = [];
    for (const spec of specs) {
      const { notebook, snapshot } = await loadSeedState(ctx, args.ownerEmail, spec.slug);
      const plan = planSeed(spec, snapshot, { publish: false, maxInFlight: DEFAULT_MAX_IN_FLIGHT });
      rows.push({
        slug: spec.slug,
        title: spec.title,
        notebookId: notebook?._id ?? null,
        isPublic: snapshot.isPublic,
        state: plan.state,
        nextSteps: plan.steps.map((s) => s.type),
        waitingOn: plan.waitingOn,
        problems: plan.problems,
        papers: snapshot.sources
          .filter((s) => s.fileType === "paper_record")
          .map((s) => `${s.key} | ${s.title}`),
      });
    }
    return rows;
  },
});
```

- [ ] **Step 4: Implement the notebook, source and Studio mutations.** Append to `convex/showcase/db.ts`:

```ts
export const ensureNotebook = internalMutation({
  args: ownerSlugArgs,
  returns: v.id("notebooks"),
  handler: async (ctx, args) => {
    const spec = showcaseNotebookBySlug(args.slug);
    const owner = await ownerByEmail(ctx.db, args.ownerEmail);
    const existing = await findShowcaseNotebook(ctx.db, owner._id, spec.title);
    if (existing) return existing._id;
    const now = Date.now();
    const folderId =
      (await findShowcaseFolder(ctx.db, owner._id))?._id ??
      (await ctx.db.insert("folders", {
        userId: owner._id,
        name: SHOWCASE_FOLDER_NAME,
        icon: "Folder",
        createdAt: now,
        updatedAt: now,
      }));
    const notebookId = await Notebooks.createNotebook(ctx, {
      userId: owner._id,
      title: spec.title,
      icon: spec.icon,
      coverColor: spec.coverColor,
      folderId,
    });
    if (spec.chatMode === "learningGuide") {
      await Notebooks.updateNotebook(ctx, notebookId, {
        chatSettings: { instructionMode: "learningGuide", responseLength: "default" },
      });
    }
    return notebookId;
  },
});

async function hasDocumentWithKey(db: Reader, notebookId: Id<"notebooks">, key: string) {
  return (await listDocuments(db, notebookId)).some((d) => documentKey(d) === key);
}

async function scheduleIngestion(
  ctx: MutationCtx,
  documentId: Id<"documents">,
  userId: Id<"users">,
  notebookId: Id<"notebooks">
) {
  await ctx.scheduler.runAfter(0, internal.documents.embeddingJob.docEmbedding, {
    documentId,
    userId,
    notebookId,
  });
}

/** A web page, YouTube video or pasted text, shaped like `documents.upload` writes it. */
export const addSource = internalMutation({
  args: { ...ownerSlugArgs, sourceIndex: v.number() },
  returns: v.union(v.id("documents"), v.null()),
  handler: async (ctx, args) => {
    const { spec, owner, notebook } = await requireShowcaseNotebook(ctx, args.ownerEmail, args.slug);
    const source = spec.sources[args.sourceIndex];
    if (!source) throw new Error(`"${spec.title}" has no source ${args.sourceIndex}`);
    if (source.kind === "file") throw new Error("File sources are fetched by the seed; use attachFileSource");
    if (await hasDocumentWithKey(ctx.db, notebook._id, sourceKey(source))) return null;
    const now = Date.now();
    const documentId = await ctx.db.insert("documents", {
      userId: owner._id,
      notebookId: notebook._id,
      fileName: source.title,
      fileType: source.kind,
      // Pasted text lives in fileUrl, as documents.upload stores it.
      fileUrl: source.kind === "text" ? source.text : source.url,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
    await scheduleIngestion(ctx, documentId, owner._id, notebook._id);
    return documentId;
  },
});

/** A PDF the seed action fetched and stored; deletes the upload if the source already exists. */
export const attachFileSource = internalMutation({
  args: { ...ownerSlugArgs, sourceIndex: v.number(), storageId: v.id("_storage") },
  returns: v.union(v.id("documents"), v.null()),
  handler: async (ctx, args) => {
    const { spec, owner, notebook } = await requireShowcaseNotebook(ctx, args.ownerEmail, args.slug);
    const source = spec.sources[args.sourceIndex];
    if (source?.kind !== "file") throw new Error(`"${spec.title}" source ${args.sourceIndex} is not a file`);
    if (await hasDocumentWithKey(ctx.db, notebook._id, sourceKey(source))) {
      await ctx.storage.delete(args.storageId);
      return null;
    }
    const file = await ctx.db.system.get("_storage", args.storageId);
    if (!file) throw new Error("Stored file not found");
    const now = Date.now();
    const documentId = await ctx.db.insert("documents", {
      userId: owner._id,
      notebookId: notebook._id,
      fileName: source.fileName,
      fileType: "file",
      fileSize: file.size,
      storageId: args.storageId,
      contentType: "application/pdf",
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
    await scheduleIngestion(ctx, documentId, owner._id, notebook._id);
    return documentId;
  },
});

/**
 * Discovered papers, shaped like the Discover dialog adds them (`documents.upload` with
 * `paper_record`), plus `fullTextPolicy` so only openly licensed full text is kept. Returns how
 * many were added; stops at the manifest's `take`.
 */
export const addDiscoveredPapers = internalMutation({
  args: {
    ...ownerSlugArgs,
    papers: v.array(v.object({ title: v.string(), paperRecord: paperRecordValidator })),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const { spec, owner, notebook } = await requireShowcaseNotebook(ctx, args.ownerEmail, args.slug);
    if (!spec.paperDiscovery) throw new Error(`"${spec.title}" has no paper discovery`);
    const existing = (await listDocuments(ctx.db, notebook._id)).filter((d) => d.fileType === "paper_record");
    const keys = new Set(existing.map(documentKey));
    let count = existing.length;
    let added = 0;
    for (const paper of args.papers) {
      if (count >= spec.paperDiscovery.take) break;
      const key = paperKey(paper);
      if (keys.has(key)) continue;
      keys.add(key);
      const pr = paper.paperRecord;
      const now = Date.now();
      const documentId = await ctx.db.insert("documents", {
        userId: owner._id,
        notebookId: notebook._id,
        fileName: paper.title.trim().slice(0, TEXT_TITLE_MAX_LENGTH),
        fileType: "paper_record",
        fileUrl: primaryLinkUrlForPaper(pr) || undefined,
        status: "pending",
        paperRecord: pr,
        fulltextStatus: deriveFulltextStatus(pr),
        ingestionStatus: "pending",
        fullTextPolicy: "open_license_only",
        createdAt: now,
        updatedAt: now,
      });
      await scheduleIngestion(ctx, documentId, owner._id, notebook._id);
      count++;
      added++;
    }
    return added;
  },
});

type StartBase = {
  userId: Id<"users">;
  notebookId: Id<"notebooks">;
  documentIds: Id<"documents">[];
};

/**
 * Creates the Studio row and schedules its job: the same rows and job args as the app's
 * `studio/scheduling/*` actions and `generate*` mutations, without auth and daily limits.
 */
async function startStudioJob(ctx: MutationCtx, base: StartBase, item: ShowcaseStudioItem): Promise<string> {
  const { userId, notebookId, documentIds } = base;
  switch (item.kind) {
    case "report": {
      const reportId = await Reports.createReport(ctx, {
        userId,
        notebookId,
        title: "Report",
        reportType: item.reportType,
        metadata: { status: "generating", documentIds },
      });
      await ctx.scheduler.runAfter(0, internal.studio.reports.job.reportGeneration, {
        reportId,
        userId,
        notebookId,
        documentIds,
        reportType: item.reportType,
        customPrompt: item.prompt,
      });
      return reportId;
    }
    case "flashcards": {
      const flashcardId = await Flashcards.createFlashcard(ctx, {
        userId,
        notebookId,
        title: "Flashcards",
        metadata: { difficulty: item.difficulty, cardCount: item.cardCount, topic: item.topic, documentIds },
      });
      await ctx.scheduler.runAfter(0, internal.studio.flashcards.job.flashcardGeneration, {
        flashcardId,
        userId,
        notebookId,
        documentIds,
        cardCount: item.cardCount,
        difficulty: item.difficulty,
        topic: item.topic,
      });
      return flashcardId;
    }
    case "quiz": {
      const quizId = await Quizzes.createQuiz(ctx, {
        userId,
        notebookId,
        title: "Quiz",
        metadata: { difficulty: item.difficulty, questionCount: item.questionCount, focus: item.focus, documentIds },
      });
      await ctx.scheduler.runAfter(0, internal.studio.quizzes.job.quizGeneration, {
        quizId,
        userId,
        notebookId,
        documentIds,
        questionCount: item.questionCount,
        difficulty: item.difficulty,
        focus: item.focus,
      });
      return quizId;
    }
    case "writtenQuestions": {
      const writtenQuestionId = await WrittenQuestions.createWrittenQuestion(ctx, {
        userId,
        notebookId,
        title: "Written Questions",
        questionType: item.questionType,
        metadata: { difficulty: item.difficulty, questionCount: item.questionCount, focus: item.focus, documentIds },
      });
      await ctx.scheduler.runAfter(0, internal.studio.writtenQuestions.job.writtenQuestionsGeneration, {
        writtenQuestionId,
        userId,
        notebookId,
        documentIds,
        questionCount: item.questionCount,
        difficulty: item.difficulty,
        questionType: item.questionType,
        focus: item.focus,
      });
      return writtenQuestionId;
    }
    case "mindmap": {
      const mindmapId = await Mindmaps.createMindmap(ctx, {
        userId,
        notebookId,
        title: "Mind Map",
        data: {},
        metadata: { documentIds },
        status: "generating",
      });
      await ctx.scheduler.runAfter(0, internal.studio.mindmaps.job.mindmapGeneration, {
        mindmapId,
        userId,
        notebookId,
        documentIds,
        customPrompt: item.prompt,
      });
      return mindmapId;
    }
    case "audio": {
      const audioOverviewId = await AudioOverviews.createAudioOverview(ctx, {
        userId,
        notebookId,
        title: "Audio Overview",
        metadata: { audioType: item.audioType, length: item.length, focus: item.focus },
        status: "generating",
      });
      await ctx.scheduler.runAfter(0, internal.studio.audio.job.audioOverviewGeneration, {
        audioOverviewId,
        userId,
        notebookId,
        documentIds,
      });
      return audioOverviewId;
    }
    case "infographic": {
      const infographicId = await Infographics.createInfographic(ctx, {
        userId,
        notebookId,
        title: "Infographic",
        data: {},
        metadata: {
          customPrompt: item.prompt,
          sourceDocumentIds: documentIds,
          orientation: item.orientation,
          detailLevel: item.detailLevel,
        },
        status: "generating",
      });
      await ctx.scheduler.runAfter(0, internal.studio.infographic.generate.generateInfographicImage, {
        infographicId,
        userId,
        notebookId,
        documentIds,
        customPrompt: item.prompt,
        orientation: item.orientation,
        detailLevel: item.detailLevel,
      });
      return infographicId;
    }
    case "spreadsheet": {
      // A preset sends its whole-table request, as the Create spreadsheet dialog does.
      const customPrompt =
        item.spreadsheetType === "custom" ? (item.prompt ?? "") : SPREADSHEET_PRESET_REQUESTS[item.spreadsheetType];
      const spreadsheetId = await Spreadsheets.createSpreadsheet(ctx, {
        userId,
        notebookId,
        title: "Spreadsheet",
        metadata: { spreadsheetType: item.spreadsheetType, customPrompt, status: "generating", documentIds },
      });
      await ctx.scheduler.runAfter(0, internal.studio.spreadsheets.job.spreadsheetGeneration, {
        spreadsheetId,
        userId,
        notebookId,
        documentIds,
        spreadsheetType: item.spreadsheetType,
        customPrompt,
      });
      return spreadsheetId;
    }
  }
}

/** Starts manifest Studio item `itemIndex` unless a row for it exists (failed rows count). */
export const startStudioItem = internalMutation({
  args: { ...ownerSlugArgs, itemIndex: v.number() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const { spec, owner, notebook } = await requireShowcaseNotebook(ctx, args.ownerEmail, args.slug);
    const item = spec.studio[args.itemIndex];
    if (!item) throw new Error(`"${spec.title}" has no Studio item ${args.itemIndex}`);
    const ordinal = spec.studio.slice(0, args.itemIndex).filter((i) => i.kind === item.kind).length;
    const existing = (await studioRows(ctx.db, item.kind, notebook._id, owner._id)).length;
    if (existing > ordinal) return null;
    if (existing < ordinal) {
      throw new Error(`Start "${spec.title}" ${item.kind} items in manifest order (${existing} exist, this is #${ordinal + 1})`);
    }
    const documentIds = (await listDocuments(ctx.db, notebook._id))
      .filter((d) => d.status === "completed")
      .map((d) => d._id);
    if (documentIds.length === 0) throw new Error(`"${spec.title}" has no ingested sources yet`);
    return await startStudioJob(ctx, { userId: owner._id, notebookId: notebook._id, documentIds }, item);
  },
});
```

- [ ] **Step 5: Codegen, run, typecheck.** `npx convex codegen` (new module), then `bun run test:convex -- convex/showcase/db.test.ts` and `bun run typecheck:convex`. Expected: PASS. If `createWrittenQuestion` or another `_model` create helper's data type rejects a field, match the field names in `convex/_model/<type>.ts` (`…Create` types) rather than casting.

- [ ] **Step 6: Commit.**

```bash
git add convex/showcase/db.ts convex/showcase/db.test.ts convex/_generated
git commit -m "feat(showcase): snapshot, notebook, source and Studio seed mutations"
```

---

## Task 9: Literature review, deep research and publishing mutations

**Files:** Modify `convex/showcase/db.ts`, `convex/showcase/db.test.ts`

- [ ] **Step 1: Write failing tests.** Append to `convex/showcase/db.test.ts`:

```ts
describe("showcase db: review outputs and publishing", () => {
  test("copies a finished literature review into Studio once", async () => {
    const { t, ownerId } = await setup();
    const notebookId = await t.mutation(internal.showcase.db.ensureNotebook, ref(REVIEW.slug));
    await t.run(async (ctx) => {
      const now = Date.now();
      const sessionId = await ctx.db.insert("literatureReviewSessions", {
        query: "q",
        notebookId,
        userId: ownerId,
        workflowId: "wf_1",
        status: "completed",
        createdAt: now,
        updatedAt: now,
      });
      const tableId = await ctx.db.insert("literatureTables", {
        title: "Spaced Repetition: Evidence Table",
        notebookId,
        userId: ownerId,
        status: "completed",
        columns: [],
        papers: [],
        literatureReviewSessionId: sessionId,
        createdAt: now,
        updatedAt: now,
      });
      const reportId = await ctx.db.insert("literatureReports", {
        title: "Spaced Repetition",
        notebookId,
        userId: ownerId,
        status: "completed",
        content: "## Summary\n\nText",
        citationStyle: "apa",
        sections: [{ heading: "Summary", content: "Text" }],
        citationIds: [],
        tableId,
        literatureReviewSessionId: sessionId,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.patch(sessionId, { tableId, reportId });
    });

    await t.mutation(internal.showcase.db.copyLiteratureReviewToStudio, ref(REVIEW.slug));
    await t.mutation(internal.showcase.db.copyLiteratureReviewToStudio, ref(REVIEW.slug));

    const { tables, reports } = await t.run(async (ctx) => ({
      tables: await ctx.db.query("literatureTables").withIndex("by_notebook", (q) => q.eq("notebookId", notebookId)).collect(),
      reports: await ctx.db.query("literatureReports").withIndex("by_notebook", (q) => q.eq("notebookId", notebookId)).collect(),
    }));
    const studioTables = tables.filter((r) => !r.literatureReviewSessionId);
    const studioReports = reports.filter((r) => !r.literatureReviewSessionId);
    expect(studioTables).toHaveLength(1);
    expect(studioReports).toHaveLength(1);
    expect(studioReports[0].tableId).toBe(studioTables[0]._id);
    expect(studioReports[0].content).toBe("## Summary\n\nText");
  });

  test("publishes a finished notebook as public and featured, and refuses an unfinished one", async () => {
    const { t } = await setup();
    const notebookId = await t.mutation(internal.showcase.db.ensureNotebook, ref(TEN_K.slug));
    await expect(t.mutation(internal.showcase.db.publishShowcaseNotebook, ref(TEN_K.slug))).rejects.toThrow(
      "isn't finished"
    );

    await t.mutation(internal.showcase.db.addSource, { ...ref(TEN_K.slug), sourceIndex: 0 });
    await markSourcesRead(t, notebookId);
    for (let itemIndex = 0; itemIndex < TEN_K.studio.length; itemIndex++) {
      await t.mutation(internal.showcase.db.startStudioItem, { ...ref(TEN_K.slug), itemIndex });
    }
    await t.run(async (ctx) => {
      for (const table of ["reports", "quizzes", "spreadsheets"] as const) {
        for (const row of await ctx.db.query(table).withIndex("by_notebook", (q) => q.eq("notebookId", notebookId)).collect()) {
          await ctx.db.patch(row._id, { status: "completed" });
        }
      }
    });

    await t.mutation(internal.showcase.db.publishShowcaseNotebook, ref(TEN_K.slug));
    const published = await t.run((ctx) => ctx.db.get(notebookId));
    expect(published).toMatchObject({ isPublic: true, isFeatured: true });
    expect(published?.publishedAt).toBeTypeOf("number");

    await t.mutation(internal.showcase.db.unpublishShowcase, { ownerEmail: OWNER, slug: TEN_K.slug });
    expect(await t.run((ctx) => ctx.db.get(notebookId))).toMatchObject({ isPublic: false, isFeatured: false });
  });

  test("deletes a showcase notebook only when the title is confirmed", async () => {
    const { t } = await setup();
    const notebookId = await t.mutation(internal.showcase.db.ensureNotebook, ref(TEN_K.slug));
    await expect(
      t.mutation(internal.showcase.db.deleteShowcaseNotebook, { ...ref(TEN_K.slug), confirmTitle: "nope" })
    ).rejects.toThrow("confirmTitle");
    await t.mutation(internal.showcase.db.deleteShowcaseNotebook, { ...ref(TEN_K.slug), confirmTitle: TEN_K.title });
    expect(await t.run((ctx) => ctx.db.get(notebookId))).toBeNull();
  });
});
```

(The workflow-starting mutations, `startShowcaseLiteratureReview` and `startShowcaseDeepResearch`, aren't unit-tested: convex-test has no `@convex-dev/workflow` component registered in this repo, and the public start mutations aren't tested past their checks either. They are checked on dev in the Runbook.)

- [ ] **Step 2: Run, expect failure.** `bun run test:convex -- convex/showcase/db.test.ts`. Expected: FAIL (functions missing).

- [ ] **Step 3: Implement.** Add these imports to `convex/showcase/db.ts`:

```ts
import { approveResearchPlanAndResume, startDeepResearchRun } from "../research/index";
import {
  confirmLiteratureReviewColumnsForSession,
  startLiteratureReviewRun,
} from "../studio/literature_tables/index";
```

and append:

```ts
/** Starts the manifest's literature review over the notebook's papers (once). */
export const startShowcaseLiteratureReview = internalMutation({
  args: ownerSlugArgs,
  returns: v.union(v.id("literatureReviewSessions"), v.null()),
  handler: async (ctx, args) => {
    const { spec, owner, notebook } = await requireShowcaseNotebook(ctx, args.ownerEmail, args.slug);
    const review = spec.literatureReview;
    if (!review) throw new Error(`"${spec.title}" has no literature review`);
    if (await latestReviewSession(ctx.db, notebook._id)) return null;
    await assertCanEditNotebook(ctx, notebook._id, owner._id);
    const documentIds = (await listDocuments(ctx.db, notebook._id))
      .filter((d) => d.fileType === "paper_record" && d.status === "completed")
      .map((d) => d._id);
    const { sessionId } = await startLiteratureReviewRun(ctx, owner._id, {
      query: review.question,
      notebookId: notebook._id,
      searchOptions: {
        researchDatabase: review.researchDatabase,
        ...(review.academicFilters ? { academicFilters: review.academicFilters } : {}),
      },
      documentIds,
      paperScope: "papers_and_search",
    });
    return sessionId;
  },
});

/** Accepts the planner's suggested columns, as the owner would in the column picker. */
export const confirmShowcaseLiteratureReview = internalMutation({
  args: ownerSlugArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    const { notebook } = await requireShowcaseNotebook(ctx, args.ownerEmail, args.slug);
    const session = await latestReviewSession(ctx.db, notebook._id);
    if (!session || session.status !== "awaiting_columns") return null;
    if (!(await isAwaitingUserInput(ctx.db, session._id))) return null;
    const columns = session.suggestedColumns ?? [];
    if (columns.length === 0) throw new Error("The review has no suggested columns to confirm");
    await confirmLiteratureReviewColumnsForSession(
      ctx,
      session,
      columns.map((c) => ({
        id: c.id,
        name: c.name,
        isVisible: c.isVisible,
        ...(c.instructions ? { instructions: c.instructions } : {}),
      }))
    );
    return null;
  },
});

/**
 * Copies the finished review's table and report into Studio: new rows without a session id
 * (the fields `performNotebookFork` copies), so viewers can open them and forks keep them.
 */
export const copyLiteratureReviewToStudio = internalMutation({
  args: ownerSlugArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    const { notebook } = await requireShowcaseNotebook(ctx, args.ownerEmail, args.slug);
    const session = await latestReviewSession(ctx.db, notebook._id);
    if (!session || session.status !== "completed" || !session.tableId || !session.reportId) {
      throw new Error("The literature review hasn't finished");
    }
    if (await reviewOutputsInStudio(ctx, session)) return null;
    const table = await ctx.db.get(session.tableId);
    const report = await ctx.db.get(session.reportId);
    if (!table || !report) throw new Error("The review's table or report is missing");
    const now = Date.now();
    const tableId = await ctx.db.insert("literatureTables", {
      title: table.title,
      description: table.description,
      notebookId: notebook._id,
      userId: table.userId,
      status: "completed",
      columns: table.columns,
      papers: table.papers,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("literatureReports", {
      title: report.title,
      notebookId: notebook._id,
      userId: report.userId,
      status: "completed",
      content: report.content,
      citationStyle: report.citationStyle,
      sections: report.sections,
      citationIds: report.citationIds,
      tableId,
      createdAt: now,
      updatedAt: now,
    });
    return null;
  },
});

/** Starts the manifest's deep research (once). Its table and report land in Studio by themselves. */
export const startShowcaseDeepResearch = internalMutation({
  args: ownerSlugArgs,
  returns: v.union(v.id("researchPlans"), v.null()),
  handler: async (ctx, args) => {
    const { spec, owner, notebook } = await requireShowcaseNotebook(ctx, args.ownerEmail, args.slug);
    const research = spec.deepResearch;
    if (!research) throw new Error(`"${spec.title}" has no deep research`);
    if (await latestResearchPlan(ctx.db, notebook._id, owner._id)) return null;
    await assertCanEditNotebook(ctx, notebook._id, owner._id);
    const { planId } = await startDeepResearchRun(ctx, owner._id, {
      notebookId: notebook._id,
      query: research.query,
      sourcePolicy: { channels: [...research.channels] },
    });
    return planId;
  },
});

/** Approves the plan unchanged, as the owner would with "Start research". */
export const approveShowcaseDeepResearch = internalMutation({
  args: ownerSlugArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    const { owner, notebook } = await requireShowcaseNotebook(ctx, args.ownerEmail, args.slug);
    const plan = await latestResearchPlan(ctx.db, notebook._id, owner._id);
    if (!plan || plan.status !== "draft" || !(await isAwaitingUserInput(ctx.db, plan._id))) return null;
    await approveResearchPlanAndResume(ctx, plan);
    return null;
  },
});

/** Public + featured, only once everything in the manifest exists and finished. */
export const publishShowcaseNotebook = internalMutation({
  args: ownerSlugArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    const { spec, notebook, snapshot } = await loadSeedState(ctx, args.ownerEmail, args.slug);
    const plan = planSeed(spec, snapshot, { publish: true, maxInFlight: DEFAULT_MAX_IN_FLIGHT });
    const unfinished = !notebook || plan.steps.some((s) => s.type !== "publish") || plan.waitingOn.length > 0 || plan.problems.length > 0;
    if (unfinished) {
      throw new Error(`"${spec.title}" isn't finished: ${[...plan.waitingOn, ...plan.problems].join("; ") || plan.steps.map((s) => s.type).join(", ")}`);
    }
    await ctx.db.patch(notebook._id, {
      isPublic: true,
      isFeatured: true,
      // Re-publishing keeps the original date, as notebooks.public.setPublic does.
      ...(notebook.isPublic ? {} : { publishedAt: Date.now() }),
    });
    return null;
  },
});

/** Rollback step 1: take showcase notebooks off the Public tab (all, or one slug). */
export const unpublishShowcase = internalMutation({
  args: { ownerEmail: v.string(), slug: v.optional(v.string()) },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const owner = await ownerByEmail(ctx.db, args.ownerEmail);
    const specs = args.slug ? [showcaseNotebookBySlug(args.slug)] : SHOWCASE_NOTEBOOKS;
    const changed: string[] = [];
    for (const spec of specs) {
      const notebook = await findShowcaseNotebook(ctx.db, owner._id, spec.title);
      if (!notebook || (!notebook.isPublic && !notebook.isFeatured)) continue;
      await ctx.db.patch(notebook._id, { isPublic: false, isFeatured: false, publishedAt: undefined });
      changed.push(spec.title);
    }
    return changed;
  },
});

/**
 * Rollback step 2: delete one showcase notebook the way the app's Delete does
 * (`removeNotebookWithRelated`: members, share links, the notebook row). `confirmTitle` must match.
 */
export const deleteShowcaseNotebook = internalMutation({
  args: { ...ownerSlugArgs, confirmTitle: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const spec = showcaseNotebookBySlug(args.slug);
    if (args.confirmTitle !== spec.title) {
      throw new Error(`confirmTitle must be exactly "${spec.title}"`);
    }
    const owner = await ownerByEmail(ctx.db, args.ownerEmail);
    const notebook = await findShowcaseNotebook(ctx.db, owner._id, spec.title);
    if (!notebook) return null;
    await Notebooks.removeNotebookWithRelated(ctx, notebook._id);
    return null;
  },
});
```

- [ ] **Step 4: Run, typecheck.** `bun run test:convex -- convex/showcase` then `bun run typecheck:convex`. Expected: PASS. If the import from `../research/index` or `../studio/literature_tables/index` creates a type cycle error in `_generated/api.d.ts`, move the two helpers of each into a sibling non-function module (`convex/research/runs.ts`, `convex/studio/literature_tables/runs.ts`) that both the public mutations and `db.ts` import.

- [ ] **Step 5: Commit.**

```bash
git add convex/showcase/db.ts convex/showcase/db.test.ts
git commit -m "feat(showcase): review, deep research, publish and rollback mutations"
```

---

## Task 10: The seed actions

No unit tests: this file is network calls and scheduling around the tested plan and mutations.

**Files:** Create `convex/showcase/seed.ts`

- [ ] **Step 1: Implement.** Create `convex/showcase/seed.ts`:

```ts
/**
 * Showcase seed (public-notebooks spec, PR 3). Internal only, run by the maintainer:
 *   npx convex run showcase/seed:seedShowcase '{"ownerEmail":"…"}'
 * `seedShowcase` checks the manifest and the owner and starts one `tick` chain per notebook. A tick
 * reads the notebook's state, runs the next steps from `planSeed`, and schedules the next tick until
 * the notebook is done or blocked. Every step's mutation re-checks the database, so ticks, re-runs and
 * overlapping chains never duplicate work. Progress: `showcase/db:seedStatus`.
 */
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { type ActionCtx, internalAction } from "../_generated/server";
import { createServiceLogger } from "../_lib/logging/serviceLogger";
import { DoiResolverService } from "../_services/extraction/DoiResolverService";
import { openAccessUserAgent } from "../_services/extraction/openAccess/OpenAccessResolver";
import type { DiscoveredSource } from "../_services/search/AcademicSearchService";
import { type PaperDiscovery, SHOWCASE_NOTEBOOKS } from "./manifest";
import { validateManifest } from "./manifestValidation";
import { paperKey, pickDiscoveredPapers, type ResolvedPaper } from "./papers";
import { DEFAULT_MAX_IN_FLIGHT, type SeedStep } from "./plan";

/** Poll interval while only waiting, and after starting something. */
const WAIT_TICK_MS = 60_000;
const BUSY_TICK_MS = 10_000;
/** A chain gives up after ~4 hours of polling. */
const MAX_TICKS = 240;
/** Notebook chains start this far apart. */
const STAGGER_MS = 20_000;
const MAX_IN_FLIGHT_CAP = 4;
const MAX_PDF_BYTES = 40 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 60_000;
const DISCOVERY_RESULTS = 20;
const MAX_DOI_LOOKUPS = 12;

const tickArgs = {
  ownerEmail: v.string(),
  slug: v.string(),
  publish: v.boolean(),
  maxInFlight: v.number(),
  tick: v.number(),
};

export const seedShowcase = internalAction({
  args: {
    ownerEmail: v.string(),
    /** One notebook; all of them when omitted. */
    slug: v.optional(v.string()),
    /** Make finished notebooks public and featured. Off by default: review first. */
    publish: v.optional(v.boolean()),
    maxInFlight: v.optional(v.number()),
  },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const errors = validateManifest(SHOWCASE_NOTEBOOKS);
    if (errors.length > 0) throw new Error(`The showcase manifest is invalid:\n${errors.join("\n")}`);
    await ctx.runQuery(internal.showcase.db.assertOwner, { ownerEmail: args.ownerEmail });
    const notebooks = args.slug ? SHOWCASE_NOTEBOOKS.filter((n) => n.slug === args.slug) : SHOWCASE_NOTEBOOKS;
    if (notebooks.length === 0) throw new Error(`No showcase notebook "${args.slug}"`);
    const maxInFlight = Math.max(1, Math.min(args.maxInFlight ?? DEFAULT_MAX_IN_FLIGHT, MAX_IN_FLIGHT_CAP));
    for (const [i, notebook] of notebooks.entries()) {
      await ctx.scheduler.runAfter(i * STAGGER_MS, internal.showcase.seed.tick, {
        ownerEmail: args.ownerEmail,
        slug: notebook.slug,
        publish: args.publish ?? false,
        maxInFlight,
        tick: 1,
      });
    }
    return notebooks.map((n) => n.slug);
  },
});

export const tick = internalAction({
  args: tickArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    const logger = createServiceLogger("showcase", "tick");
    const { plan, paperKeys } = await ctx.runQuery(internal.showcase.db.getSeedState, {
      ownerEmail: args.ownerEmail,
      slug: args.slug,
      publish: args.publish,
      maxInFlight: args.maxInFlight,
    });
    logger.info("showcase_tick", {
      slug: args.slug,
      tick: args.tick,
      state: plan.state,
      steps: plan.steps.map((s) => s.type),
      waitingOn: plan.waitingOn,
      problems: plan.problems,
    });
    if (plan.state === "done") return null;
    if (plan.state === "blocked") {
      logger.warn("showcase_blocked", { slug: args.slug, problems: plan.problems });
      return null;
    }
    if (args.tick > 1 && plan.steps.some((s) => s.type === "createNotebook")) {
      // Deleted while the chain was running (a rollback): don't recreate it.
      logger.warn("showcase_notebook_gone", { slug: args.slug });
      return null;
    }
    for (const step of plan.steps) {
      try {
        await runStep(ctx, args, step, paperKeys);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn("showcase_step_failed", { slug: args.slug, step: step.type, error: message });
        throw new Error(`Showcase "${args.slug}": ${step.type} failed: ${message}`);
      }
    }
    if (args.tick >= MAX_TICKS) {
      logger.warn("showcase_gave_up", { slug: args.slug, waitingOn: plan.waitingOn });
      return null;
    }
    await ctx.scheduler.runAfter(
      plan.steps.length > 0 ? BUSY_TICK_MS : WAIT_TICK_MS,
      internal.showcase.seed.tick,
      { ...args, tick: args.tick + 1 }
    );
    return null;
  },
});

function spec(slug: string) {
  const notebook = SHOWCASE_NOTEBOOKS.find((n) => n.slug === slug);
  if (!notebook) throw new Error(`No showcase notebook "${slug}"`);
  return notebook;
}

async function runStep(
  ctx: ActionCtx,
  args: { ownerEmail: string; slug: string },
  step: SeedStep,
  paperKeys: string[]
): Promise<void> {
  const ref = { ownerEmail: args.ownerEmail, slug: args.slug };
  switch (step.type) {
    case "createNotebook":
      await ctx.runMutation(internal.showcase.db.ensureNotebook, ref);
      return;
    case "addSource": {
      const source = spec(args.slug).sources[step.sourceIndex];
      if (source.kind !== "file") {
        await ctx.runMutation(internal.showcase.db.addSource, { ...ref, sourceIndex: step.sourceIndex });
        return;
      }
      const storageId = await fetchPdfToStorage(ctx, source.url);
      try {
        await ctx.runMutation(internal.showcase.db.attachFileSource, {
          ...ref,
          sourceIndex: step.sourceIndex,
          storageId,
        });
      } catch (error) {
        await ctx.storage.delete(storageId);
        throw error;
      }
      return;
    }
    case "discoverPapers": {
      const discovery = spec(args.slug).paperDiscovery;
      if (!discovery) throw new Error("No paperDiscovery in the manifest");
      const { papers, rateLimited } = await discoverPapers(ctx, discovery, new Set(paperKeys), step.needed);
      const added = await ctx.runMutation(internal.showcase.db.addDiscoveredPapers, { ...ref, papers });
      if (added === 0 && !rateLimited) {
        throw new Error(`Discovery for "${discovery.query}" found no new papers; widen the query or filters`);
      }
      return;
    }
    case "startStudioItem":
      await ctx.runMutation(internal.showcase.db.startStudioItem, { ...ref, itemIndex: step.itemIndex });
      return;
    case "startLiteratureReview":
      await ctx.runMutation(internal.showcase.db.startShowcaseLiteratureReview, ref);
      return;
    case "confirmLiteratureReviewColumns":
      await ctx.runMutation(internal.showcase.db.confirmShowcaseLiteratureReview, ref);
      return;
    case "copyLiteratureReviewToStudio":
      await ctx.runMutation(internal.showcase.db.copyLiteratureReviewToStudio, ref);
      return;
    case "startDeepResearch":
      await ctx.runMutation(internal.showcase.db.startShowcaseDeepResearch, ref);
      return;
    case "approveDeepResearchPlan":
      await ctx.runMutation(internal.showcase.db.approveShowcaseDeepResearch, ref);
      return;
    case "publish":
      await ctx.runMutation(internal.showcase.db.publishShowcaseNotebook, ref);
      return;
  }
}

/** Downloads a PDF (declared user agent, size cap, `%PDF-` check) into Convex storage. */
async function fetchPdfToStorage(ctx: ActionCtx, url: string): Promise<Id<"_storage">> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": openAccessUserAgent(), Accept: "application/pdf" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`GET ${url} returned HTTP ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_PDF_BYTES) {
      throw new Error(`${url} is ${bytes.byteLength} bytes; the seed stores PDFs up to ${MAX_PDF_BYTES}`);
    }
    if (new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") throw new Error(`${url} is not a PDF`);
    return await ctx.storage.store(new Blob([bytes], { type: "application/pdf" }));
  } finally {
    clearTimeout(timer);
  }
}

/** Full metadata (authors, venue, licence) through the "Import from DOI" resolver. */
async function resolvePapers(ids: string[]): Promise<ResolvedPaper[]> {
  const resolver = new DoiResolverService();
  const resolved: ResolvedPaper[] = [];
  for (const id of ids) {
    try {
      // Accepts a DOI or an arXiv link; anything else throws and is skipped.
      const record = await resolver.resolve(id);
      if (!record) continue;
      const { title, sourceType: _sourceType, ...paperRecord } = record;
      resolved.push({ title, paperRecord });
    } catch {
      // An unresolvable id is skipped, like a failed DOI lookup in the dialog.
    }
  }
  return resolved;
}

/**
 * Pinned DOIs when the manifest has them (prod gets the dev run's papers); otherwise Discover's
 * academic search, then the DOI resolver. Rate-limited searches return nothing; the next tick
 * tries again.
 */
async function discoverPapers(
  ctx: ActionCtx,
  discovery: PaperDiscovery,
  existingKeys: ReadonlySet<string>,
  needed: number
): Promise<{ papers: ResolvedPaper[]; rateLimited: boolean }> {
  if (discovery.pinnedDois) {
    const pinned = await resolvePapers(discovery.pinnedDois);
    // Keep the pinned order: no licence re-ranking.
    const fresh = pinned.filter((paper) => !existingKeys.has(paperKey(paper)));
    return { papers: fresh.slice(0, needed), rateLimited: false };
  }
  const { sources, rateLimited } = (await ctx.runAction(
    internal._services.search.AcademicSearchService.discoverAcademicPapersInternal,
    { query: discovery.query, maxResults: DISCOVERY_RESULTS, ...discovery.filters }
  )) as { sources: DiscoveredSource[]; rateLimited: boolean };
  const resolved = await resolvePapers(
    sources.slice(0, MAX_DOI_LOOKUPS).map((source) => source.metadata?.doi ?? source.url)
  );
  return { papers: pickDiscoveredPapers(resolved, existingKeys, needed), rateLimited };
}
```

- [ ] **Step 2: Codegen and typecheck.** `npx convex codegen` then `bun run typecheck:convex`. Expected: PASS. Notes if it fails:
  - `import type { DiscoveredSource }` from a `"use node"` file is type-only and erased; if the bundler still complains, declare the shape locally (`{ title: string; url: string; metadata?: { doi?: string } }`).
  - If `ActionCtx` isn't exported from `_generated/server`, use `GenericActionCtx<DataModel>` as `convex/eval/studioEvalAction.ts` does.

- [ ] **Step 3: Lint and Knip.** `bun run lint` and `bunx knip` (or the CI Knip script in `package.json`). Expected: no unused exports in `convex/showcase/*`.

- [ ] **Step 4: Commit.**

```bash
git add convex/showcase/seed.ts convex/_generated
git commit -m "feat(showcase): seed entry point and resumable tick chain"
```

---

## Task 11: Validation gates and PR

- [ ] **Step 1:** `bun run typecheck:convex`, `bun run typecheck:web` (one at a time). Expected: PASS.
- [ ] **Step 2:** `bun run lint` and `bun run lint:design`. Expected: PASS.
- [ ] **Step 3:** `bun run test:convex`. Expected: PASS.
- [ ] **Step 4:** `npx convex codegen` and confirm `git status` shows no `convex/_generated` diff.
- [ ] **Step 5:** Push and open the PR against **`feature/public-notebooks`**, title **`feat(notebooks): showcase notebooks seed`**. Body: summary; the design-decisions table; the Sources appendix (titles, URLs, licences); the licence findings (OpenStax, NREL, MedlinePlus drug pages and MIT OCW excluded; YouTube videos limited to CC BY); the Runbook; the Decisions and Follow-ups sections. State plainly: **the seed has not been run** on any deployment. End with the Claude Code attribution line.
- [ ] **Step 6:** **Do not run the seed.** Running it on dev and prod follows the Runbook after review, and `--prod` only with the user's explicit go-ahead.

---

## Runbook (maintainer, after the PR is reviewed)

Prerequisites:

- PR 1 (and this PR) deployed to the target deployment; the maintainer's account exists there (sign up with the email first).
- Provider credits: the seed runs 24 Studio jobs (4 audio overviews with TTS, 2 infographics), 1 literature review and 1 deep research per deployment, plus scraping/OCR/transcripts for 27 sources (5 of them YouTube transcripts). Probe Together first (dev hit 402 before). Other sessions also deploy to the shared dev deployment; if jobs fail en masse, check that first.
- Pick the email by variable so it never lands in the repo or shell history files you commit: `OWNER='<maintainer email>'`.

**1. Build on dev (not published):**

```bash
npx convex run showcase/seed:seedShowcase "{\"ownerEmail\":\"$OWNER\"}"
```

One notebook only: add `"slug":"econ-101-midterm-prep"`. Lower load: `"maxInFlight":1`.

**2. Watch progress:**

```bash
npx convex run showcase/db:seedStatus "{\"ownerEmail\":\"$OWNER\"}"
npx convex logs        # look for showcase_tick / showcase_blocked / showcase_step_failed
```

Each row shows `state` (`working` / `blocked` / `done`), `nextSteps`, `waitingOn` and `problems`. A full run takes roughly 30–90 minutes, the literature-review notebook longest.

**3. Fix and re-run.** A `blocked` notebook lists why: delete the failed source or Studio item in the app (or Retry a failed review / deep research from the chat), then run step 1 again — finished work is skipped. A step that throws (for example a PDF URL returning 404, or "Discovery … found no new papers") stops that chain with the error in the logs; fix the manifest or the cause and re-run.

First-run checks on dev:

- **The 10-K on sec.gov.** sec.gov answers 403 to clients without a declared User-Agent, and whether Supadata's scraper gets through is only known once the source ingests (or fails) on dev. If it fails, in order of preference: (a) give the scraper path a declared User-Agent for sec.gov (a small change to `WebLoaderService`, its own PR); (b) have the seed fetch the filing itself with `openAccessUserAgent()` and store it as a pasted-text source (convert the HTML to text in the seed action; tables flatten, so check the financial spreadsheet); (c) switch to another public filing host whose terms allow republication. Then delete the failed source and re-run.
- **YouTube transcripts.** Four of the five videos have only auto-generated English captions; confirm each video source ingests with a readable transcript. A video whose transcript fails or is unusable: delete it in the app and remove it from the manifest (each notebook still has enough text sources).
- **YouTube source titles.** After ingestion a YouTube source shows the video's own title, not the manifest title (which names the channel). The source keeps its watch URL, which identifies the uploader's channel; that link is the CC BY attribution, so leave it in place.
- **A Studio item that never starts.** The seed creates each Studio row as `draft` and the job moves it to `generating`. The stuck-jobs cron (`studio/jobMutations/stuckJobs.ts`) only fails rows stuck in `generating`, so a row whose job never ran stays `draft` and `seedStatus` keeps listing it as generating. If an item sits in `draft` for more than a few minutes, delete it in the app and run step 1 again.

**4. Review every notebook in the app** as the owner and as a second account (viewer): sources readable, every Studio item present and sensible, the literature table and review draft in Studio, the deep-research evidence table and report in Studio, Learning Guide mode on ECON 101, papers in the literature review notebook showing full text only for CC BY/CC0/public-domain ones. In LLM Hallucinations, the method comparison the spec calls a literature table is a custom spreadsheet (one row per method); check its columns are filled. Fork one notebook as the second account.

**5. Pin the discovered papers.** Once the review notebook is right on dev, list its papers:

```bash
npx convex run showcase/db:seedStatus "{\"ownerEmail\":\"$OWNER\",\"slug\":\"spaced-repetition-literature-review\"}"
```

Copy the five DOIs from `papers` (`doi:10.… | Title`; drop the `doi:` prefix) into `paperDiscovery.pinnedDois` in `convex/showcase/manifest.ts`, keep `query`/`filters` as the record of how they were found, and merge that change (one-line PR) before the prod run. Re-running on dev afterwards changes nothing (the five papers already exist). If a paper has no DOI (`title:` key), replace it with another paper from the same search that has one, after checking it on dev.

**6. Publish on dev:**

```bash
npx convex run showcase/seed:seedShowcase "{\"ownerEmail\":\"$OWNER\",\"publish\":true}"
```

Nothing is regenerated; finished notebooks become public and featured.

**7. Prod — only after the user explicitly approves, and after step 5 is merged and deployed:** steps 1–4 and 6 with `--prod` after `run` (e.g. `npx convex run --prod showcase/seed:seedShowcase "{\"ownerEmail\":\"$OWNER\"}"`), reviewing in the prod app before the `"publish":true` run. Prod resolves the pinned DOIs, so it gets the same papers as dev.

**Re-running safely:** any number of times, any order; the notebook is matched by title in the owner's Showcase folder, sources by URL/file name/title/DOI, Studio items by count per kind. Renaming a seeded notebook or moving it out of the Showcase folder makes the seed create a new one. Running two chains for the same notebook at once wastes polls but cannot duplicate items. Still, don't start a second `seedShowcase` while one is running (check `npx convex logs` for `showcase_tick` lines first): each run starts its own chain per notebook, so overlapping runs double the polling until both finish.

**Rollback:**

```bash
# 1. Off the Public tab (all, or add "slug"):
npx convex run showcase/db:unpublishShowcase "{\"ownerEmail\":\"$OWNER\"}"
# 2. Delete a notebook (repeat per slug; title must match exactly):
npx convex run showcase/db:deleteShowcaseNotebook "{\"ownerEmail\":\"$OWNER\",\"slug\":\"reading-a-10-k\",\"confirmTitle\":\"Reading a 10-K\"}"
```

Deleting works like the app's Delete (`removeNotebookWithRelated`): documents, chunks and Studio rows are left orphaned, as they are today for any deleted notebook. A tick chain still running stops by itself when its notebook disappears. Forks users already made are theirs and are not touched.

---

## Sources appendix

Web pages and papers checked on 2026-10-16, videos on 2026-10-18 (each URL fetched; licences read on the publisher's page). Wikipedia text is CC BY-SA 4.0 (footer of every article); U.S. federal works are public domain (energy.gov web policies, EIA "Copyrights and reuse", FDA website policies, NIGMS disclaimers).

**How the YouTube licences were verified.** YouTube offers one Creative Commons licence, CC BY 3.0, shown as "Creative Commons Attribution licence (reuse allowed)". For each video: (1) it was found through YouTube search with the Creative Commons filter (`&sp=EgIwAQ%3D%3D`); (2) its watch page (`https://www.youtube.com/watch?v=<id>`, fetched 2026-10-18) has the description metadata row `"title":{"runs":[{"text":"License"}]}` → `"Creative Commons Attribution license (reuse allowed)"`; standard-licence videos have no such row; (3) the full description (`videoDetails.shortDescription`) was read for a conflicting licence, and videos whose description names a narrower licence were rejected (more restrictive wins); (4) the channel's About page was read to confirm who publishes it; (5) `captionTracks` was checked so the transcript can be ingested. Re-check (2) before the prod run: the licence is the uploader's setting and can change.

**ECON 101 · Midterm Prep**

| Source | URL | Type | Licence |
| --- | --- | --- | --- |
| Supply and demand | https://en.wikipedia.org/wiki/Supply_and_demand | url | CC BY-SA 4.0 |
| Price elasticity of demand | https://en.wikipedia.org/wiki/Price_elasticity_of_demand | url | CC BY-SA 4.0 |
| Perfect competition | https://en.wikipedia.org/wiki/Perfect_competition | url | CC BY-SA 4.0 |
| Demand and supply: Market Equilibrium — OER Africa (an open-educational-resources initiative for African higher education; 10 min, 2014) | https://www.youtube.com/watch?v=alH1sJ8VbAY | youtube | CC BY 3.0 — License row "Creative Commons Attribution license (reuse allowed)"; description empty (no conflict); English auto captions |
| Intermediate Microeconomics: Elasticity of Demand — Department of Economics, University of Utah (channel About: "videos that accompany online undergraduate classes offered by the Department of Economics at the University of Utah"; 14 min, 2014) | https://www.youtube.com/watch?v=zTqTW5n8wxg | youtube | CC BY 3.0 — License row as above; description has no other licence; English auto captions |

**Pharmacology Essentials**

| Source | URL | Type | Licence |
| --- | --- | --- | --- |
| Pharmacokinetics | https://en.wikipedia.org/wiki/Pharmacokinetics | url | CC BY-SA 4.0 |
| Beta blocker | https://en.wikipedia.org/wiki/Beta_blocker | url | CC BY-SA 4.0 |
| What Happens to Medicine in Your Body? (NIGMS Biomedical Beat, 2023) | https://nigms.nih.gov/biobeat/2023/09/what-happens-to-medicine-in-your-body | url | Public domain (NIGMS: not copyrighted, use with attribution) |
| Drug Interactions: What You Should Know (FDA) | https://www.fda.gov/drugs/resources-drugs/drug-interactions-what-you-should-know | url | Public domain (FDA website policies) |
| Pharmacokinetics Visualized — VetMedAcademy, "in collaboration with MSD Veterinary Manual" (animated; one-compartment model, first-order elimination, "as applied in veterinary and human medicine"; 16 min, 2020) | https://www.youtube.com/watch?v=0-fERRXiOzo | youtube | CC BY 3.0 — License row "Creative Commons Attribution license (reuse allowed)"; description has no other licence; English auto captions |

**Literature Review: Does Spaced Repetition Work?** — discovered on the first (dev) run, then pinned (Runbook step 5):

- Discovery: query `spaced repetition long-term retention`, filters `publicationYearFrom: 2010, minCitations: 10, openAccessOnly: true, hasFullText: true`, 5 papers; openly licensed papers are preferred; each is resolved through the DOI resolver and stored with `fullTextPolicy: "open_license_only"` (full text only under CC BY/CC BY-SA/CC0/public domain, else metadata + abstract). OpenAlex shows about 1 in 4 matching papers is CC BY, e.g. *Enhancing human learning via spaced repetition optimization* (PNAS 2019, 10.1073/pnas.1815156116), *A Trainable Spaced Repetition Model for Language Learning* (ACL 2016, 10.18653/v1/p16-1174), *A spaced-repetition approach to enhance medical student learning and engagement in medical pharmacology* (BMC Med Educ 2022, 10.1186/s12909-022-03324-8), *Very Similar Spacing-Effect Patterns in Very Different Learning/Practice Domains* (PLoS ONE 2014, 10.1371/journal.pone.0090656). Classics such as Cepeda et al. 2006 are not CC BY and would stay abstract-only.
- Literature review question (criteria inside, as a user types them): see the manifest; `researchDatabase: "all"`, notebook papers included, search on (`papers_and_search`).
- Deep research: channels `notebook` + `academic` (no general web, so the evidence table quotes scholarly abstracts only).

**LLM Hallucinations: Paper Digest** (licence read on each arXiv abstract page, all versions)

| Paper | URL | Licence |
| --- | --- | --- |
| Survey of Hallucination in Natural Language Generation | https://arxiv.org/abs/2202.03629 | CC BY 4.0 |
| SelfCheckGPT | https://arxiv.org/abs/2303.08896 | CC BY 4.0 |
| Semantic Uncertainty (semantic entropy) | https://arxiv.org/abs/2302.09664 | CC BY 4.0 |
| Self-RAG | https://arxiv.org/abs/2310.11511 | CC BY 4.0 |
| Fine-grained Hallucination Detection and Editing (FAVA) | https://arxiv.org/abs/2401.06855 | CC BY 4.0 |
| Video: Visualizing LLM Hallucinations — Anand S, FOSSASIA Summit 2025, FOSSASIA channel (how token probabilities and temperature lead to plausible wrong answers, log-probabilities as an error signal; 25 min, 2025-04-18; slides at sanand0.github.io/llmhallucinations) | https://www.youtube.com/watch?v=FEz3rMwArQs | CC BY 3.0 — License row "Creative Commons Attribution license (reuse allowed)"; description has no other licence; English auto captions |

`url` sources: the app reads an arXiv abstract link as the paper's PDF (`pdfUrlForLink`). Alternates, also CC BY 4.0: 2509.04664, 2306.03341, 2401.01313, 2311.14648; HalluLens 2504.17550 is CC BY-SA 4.0.

**Home Battery Storage · Market Scan**

| Source | URL | Type | Licence |
| --- | --- | --- | --- |
| Solar-Plus-Storage 101 (DOE) | https://www.energy.gov/cmei/systems/articles/solar-plus-storage-101 | url | Public domain (energy.gov) |
| California residents are increasingly pairing battery storage with solar installations (EIA, 2024-07-18) | https://www.eia.gov/todayinenergy/detail.php?id=62524 | url | Public domain (EIA; credit "Source: U.S. Energy Information Administration") |
| Energy storage for electricity generation (EIA Energy Explained) | https://www.eia.gov/energyexplained/electricity/energy-storage-for-electricity-generation.php | url | Public domain (EIA) |
| Large-scale battery storage: Challenges and opportunities for technology and policy — video abstract of Faunce et al., *MRS Energy & Sustainability* (2018), doi:10.1557/mre.2018.11, produced by Research Square, AJE Video Bytes channel (4 min, 2019) | https://www.youtube.com/watch?v=U__l-CFg6wM | youtube | CC BY 3.0 — License row "Creative Commons Attribution license (reuse allowed)"; description cites the article, no other licence; English captions (uploaded) |

This is grid-scale rather than home storage; no CC BY home-battery explainer from a reputable channel was found (the CC-filtered results for home batteries are installer and influencer channels). Alternates on the Stanford ENERGY channel, also CC BY: "Gamechanger: How Far Can Batteries Go?" (`OY2C_SshyeQ`, 18 min; content not reviewed) and "The Battery and Solar Revolution | Yi Cui" (`9hOcI3BIyXY`, 4 min).

**Reading a 10-K**

| Source | URL | Type | Licence |
| --- | --- | --- | --- |
| Costco Wholesale Corp. Form 10-K, FY ended 2026-08-30 (filed 2026-10-07) | https://www.sec.gov/Archives/edgar/data/909832/000090983226000093/cost-20260830.htm | url | sec.gov: "public information … may be copied or further distributed … without the SEC's permission" (cite the SEC). ~33k words. sec.gov returns 403 to clients without a declared User-Agent. |

**Getting Started with SolomindLM** — one pasted-text source, `GETTING_STARTED_GUIDE` (written for this PR).

**Rejected**

| Candidate | Why |
| --- | --- |
| OpenStax *Principles of Economics 3e* and *Pharmacology for Nurses* (all chapter pages) | CC BY-NC-SA 4.0, not CC BY, and every OpenStax page forbids ingesting the book into "large language models or generative AI offerings" without written permission. *Principles of Economics 2e* is CC BY but carries the same AI clause. |
| MedlinePlus drug monographs (`medlineplus.gov/druginfo/meds/…`) | © ASHP (AHFS), all rights reserved; only MedlinePlus health-topic summaries are public domain, and those are short (~200 words). |
| NREL reports and ATB pages | nrel.gov no longer resolves (the lab is now "National Laboratory of the Rockies", nlr.gov); its disclaimer grants a licence to the U.S. Government only and does not place reports in the public domain. |
| arXiv: TruthfulQA, HaluEval, FActScore, Chain-of-Verification, DoLa, RARR, CRAG, Huang et al. survey, Semantic Entropy Probes, Lookback Lens, SimpleQA, "Hallucination is Inevitable" | arXiv non-exclusive distribution licence (not CC). |
| arXiv: Siren's Song survey, FELM, "The Internal State of an LLM Knows When It's Lying" | CC BY-NC-SA / CC BY-NC-ND. |
| EIA battery storage market trends study page | Summary + Excel links only, no text. |
| DOE Energy Storage Market Report 2020 PDF | 65 pages, mostly non-residential, NREL-authored, third-party charts. |
| Costco investor-relations annual report PDF | Costco site terms forbid republication; EDGAR is the better host. |
| MIT OpenCourseWare 14.01 lectures (`8ssjKR7nNck`, `-Z35m38qLd4` and the Fall 2018 set) | CC BY-NC-SA 4.0, and OCW's terms allow AI use only non-commercially; dropped (decision 1). |
| Dr. Mary J. McGlasson "Episode 11 - Demand" (`uXlZIn6W7Ew`), "Episode 16: Elasticity of Demand" (`4oj_lnj6pXA`), mjmfoodie channel | YouTube licence row says CC BY, but the description says CC BY-NC-ND 3.0; the narrower licence wins. |
| UMassEconomics "Changes in Supply and Demand" (`Q3aVVm-Yx2I`), "Elasticity of Demand" (`mbRzO9YG9YQ`) | YouTube row CC BY, description CC BY-NC-SA 3.0. |
| Crash Course Economics (e.g. `3ez10ADR_gM`) | Standard YouTube licence (no License row). |
| Other CC-filtered pharmacokinetics videos (Advanced eClinical Training, Professor G, Nursing School Explained) | CC BY, but small or unidentified training channels; VetMedAcademy is the better-sourced explainer. |
| "Reducing Hallucinations and Evaluating LLMs for Production" (The Linux Foundation, `unnqhKmMo68`) | CC BY, but a vendor (Deepchecks) talk; the FOSSASIA talk explains the mechanism. Other CC-filtered "AI hallucination" results are small channels or shorts. |
| CC-filtered home-battery videos ("Your Energy Answers", "Renewable Energy Talks", installers) | CC BY, but influencer/installer channels, not reputable explainers. |

---

## Decisions (recorded 2026-10-18)

1. **Videos:** MIT OCW dropped. Only YouTube videos with YouTube's CC BY licence, verified as above: two for ECON 101, one each for Pharmacology, Home Battery Storage (grid-scale; no reputable home-battery CC BY video exists) and LLM Hallucinations.
2. **Author name:** public cards keep showing the owner's own display name. No publisher-name feature.
3. **Paper full-text policy:** open-licence-only is opt-in per document and set only by the showcase seed (Task 1 scope note).
4. **Wikipedia (CC BY-SA 4.0):** fine. Each source keeps its Wikipedia URL and title visible as attribution. ShareAlike may apply to Studio items generated from those pages; accepted.
5. **Battery notebook:** three public-domain sources plus one CC BY video is enough; no NREL/NLR material.
6. **Discovered papers:** found by search on the dev run, then the 5 DOIs are pinned into the manifest before prod (`paperDiscovery.pinnedDois`, Runbook step 5).
7. **sec.gov 403:** handled during the dev run with the fallbacks in Runbook step 3.
8. **Counts and length:** "~60 cards" is 55 (the largest dialog option); the Pharmacology "~8-min" recap is `brief` + `short` (nominally ~12 min).

## Follow-ups (not in this PR)

- Users' own public notebooks still republish whatever full text ingestion found for their papers (open-access copies under any licence and publisher landing-page scrapes); only seeded papers use `open_license_only`. Decide whether publishing a notebook should apply the same policy.
- If the dev run needs it: a declared User-Agent for sec.gov in the scraper (Runbook step 3, option a).
- Discover's academic results drop authors (`toDiscoveredSource` in `AcademicSearchService.ts`), so papers added from the Discover dialog have no authors; the seed works around it with the DOI resolver.

## Self-review against the spec

| Spec requirement (PR 3) | Where |
| --- | --- |
| `convex/showcase/manifest.ts`: typed notebooks → sources → Studio items | Tasks 4–5 |
| `convex/showcase/seed.ts` internal action `seedShowcase({ ownerEmail, slug? })` | Task 10 |
| Notebook created idempotently by title + owner | `ensureNotebook` (Showcase folder) |
| Sources inserted, `docEmbedding` scheduled, wait for ingestion | `addSource` / `attachFileSource` / `addDiscoveredPapers`; `planSeed` step 1 |
| Studio jobs through the internal row-creation path `studioEvalAction.ts` uses | `startStudioJob` (same `_model` creators and job actions as the public paths) |
| Sets `isPublic` and `isFeatured` | `publishShowcaseNotebook` (behind `publish: true`) |
| Re-running skips what exists | count/key matching + per-mutation re-checks; `plan.test.ts`, `db.test.ts` |
| File sources fetched and stored with `ctx.storage.store` | `fetchPdfToStorage` + `attachFileSource` (no manifest source needs it today; kept for PDFs) |
| Literature review and deep research through their workflows; seed approves the pauses | Tasks 2–3, `confirmShowcaseLiteratureReview`, `approveShowcaseDeepResearch` |
| Final table/report saved as Studio items (no `literatureReviewSessionId`) | `copyLiteratureReviewToStudio`; deep-research artifacts are already Studio-visible |
| Only openly licensed / public-domain sources; discovered papers metadata + abstract unless openly licensed | Sources appendix (videos limited to YouTube CC BY); Task 1 (opt-in, seed only) |
| "Papers added through academic discovery" | Discover's search + DOI resolver on dev; the same DOIs pinned for prod (`pinnedDois`) |
| Run on dev, review, then prod | Runbook (prod only with the user's approval, after the DOIs are pinned) |
| Lineup (7 notebooks, every Studio type, 1 literature review, 1 deep research) | Task 5 + its coverage test |
| No production prompt changed; user-style options | Task 4 validation; no file under `convex/_agents/**/prompts*` is touched |

Differences from the spec, to note in the PR: OpenStax, MedlinePlus drug pages and MIT OCW videos are replaced (licences) by Wikipedia, U.S. government pages and CC BY YouTube videos; "~60-card deck" is 55 (the largest dialog option); the 8-minute audio is the "short" length; the deep research report is not duplicated into `reports` because it is already a Studio literature report; the spec's "literature table comparing methods" for LLM Hallucinations is a custom spreadsheet (one row per method), since Studio literature tables only come from a literature review or deep research.

Re-check after the 2026-10-18 changes: source counts are ECON 5, Pharmacology 5, Literature Review 5 (discovered), LLM 6, Battery 4, 10-K 1, Getting Started 1 — all within `validateManifest`'s 1–6; every `youtube` URL is on `www.youtube.com`; `YOUTUBE_CC_BY` replaces the removed `MIT_OCW` constant; `pinnedDois` is validated (Task 4 test), honoured by `discoverPapers` (Task 10) and listed by `seedStatus.papers` (Task 8) for Runbook step 5; Task 1 states the policy is seed-only.
