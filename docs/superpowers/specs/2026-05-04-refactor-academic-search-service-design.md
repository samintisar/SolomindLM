# Design: Refactor AcademicSearchService.ts

**Date:** 2026-05-04  
**Scope:** `convex/_services/search/AcademicSearchService.ts`  
**Goal:** Improve readability, testability, and reusability by splitting a 975-line monolith into focused, single-responsibility modules.

---

## Problem

`AcademicSearchService.ts` has grown to ~975 lines and mixes concerns:
- Data models (types)
- Generic XML parsing utilities
- Domain-specific paper scoring / filtering / deduplication
- Three distinct external API integrations (arXiv, Semantic Scholar, PubMed)
- Orchestration logic (which providers to call, how to merge results)
- Convex action wrappers

This makes the file hard to read, hard to test in isolation, and hard to reuse generic helpers elsewhere.

---

## Constraints

1. **Preserve public API.** Existing call sites import `internal._services.search.AcademicSearchService.discoverAcademicPapersInternal` and `.searchInternal`. These must continue to work without changes.
2. **Follow existing patterns.** The codebase is functional, not OOP. Prefer plain functions and explicit imports over class-based abstractions.
3. **No behavioral changes.** This is a pure refactor: same inputs, same outputs, same side effects.

---

## Proposed Architecture

Introduce a new directory `convex/_services/search/academic/` with clear separation of concerns.

### Directory Layout

```
convex/_services/search/academic/
  ├── index.ts                    # Optional re-exports for convenience
  ├── types.ts                    # All interfaces and type aliases
  ├── utils/
  │   ├── xmlParsing.ts           # Generic regex-based XML helpers
  │   └── paperProcessing.ts      # Scoring, deduplication, filtering, sorting
  ├── providers/
  │   ├── arxiv.ts                # arXiv API search + response parsing
  │   ├── semanticScholar.ts      # Semantic Scholar API search + retry logic
  │   └── pubmed.ts               # PubMed esearch + efetch + response parsing
  └── AcademicSearchService.ts    # Thin facade: orchestration + Convex actions
```

### Module Responsibilities

| Module | Responsibility | Exports (examples) |
|---|---|---|
| `types.ts` | Central type definitions | `AcademicPaper`, `DiscoveredSource`, `SearchInternalArgs`, `DiscoverAcademicPapersArgs` |
| `utils/xmlParsing.ts` | Regex-based XML extraction | `extractTag`, `extractAllTags`, `stripXmlTags`, `extractAttribute`, `extractXmlBlocks` |
| `utils/paperProcessing.ts` | Domain logic for paper collections | `calculateScore`, `normalizeTitle`, `deduplicatePapers`, `filterPapers`, `sortPapers`, `toDiscoveredSource`, `yearToDateString`, `extractDomain` |
| `providers/arxiv.ts` | arXiv integration | `searchArxiv(query, maxResults, filters): Promise<AcademicPaper[]>` |
| `providers/semanticScholar.ts` | Semantic Scholar integration | `searchSemanticScholar(query, maxResults, filters): Promise<AcademicPaper[]>` |
| `providers/pubmed.ts` | PubMed integration | `searchPubMed(query, maxResults, filters): Promise<AcademicPaper[]>` |
| `AcademicSearchService.ts` | Orchestration + Convex actions | `searchInternalHandler`, `discoverAcademicPapersInternalHandler`, `searchInternal`, `discoverAcademicPapersInternal` |

### What Stays in `AcademicSearchService.ts`

- `searchInternalHandler`: decides which providers to invoke based on `provider` arg, runs them (with delays/timeouts), merges results, applies post-processing.
- `discoverAcademicPapersInternalHandler`: public handler, normalizes query, delegates to `searchInternalHandler` (or cache), maps to `DiscoveredSource`.
- The `internalAction` wrappers (`searchInternal`, `discoverAcademicPapersInternal`).
- The `createCachedAction` setup and `normalizeQuery` helper (cache-specific).
- Re-export of public types if needed for backward compatibility.

### What Moves Out

| Current location (line range) | Destination |
|---|---|
| Lines 20–53 (interfaces) | `types.ts` |
| Lines 59–96 (XML helpers) | `utils/xmlParsing.ts` |
| Lines 102–156 (utility helpers) | `utils/paperProcessing.ts` |
| Lines 162–267 (`searchArxiv`) | `providers/arxiv.ts` |
| Lines 273–414 (`searchSemanticScholar`) | `providers/semanticScholar.ts` |
| Lines 420–619 (`searchPubMed`) | `providers/pubmed.ts` |
| Lines 625–682 (dedup/filter/sort) | `utils/paperProcessing.ts` |

---

## Testability Improvements

Today, `AcademicSearchService.test.ts` tests everything in one file. After refactoring, tests split by concern:

| New test file | What it tests |
|---|---|
| `utils/xmlParsing.test.ts` | `extractTag`, `extractXmlBlocks`, edge cases in malformed XML |
| `utils/paperProcessing.test.ts` | `calculateScore`, `deduplicatePapers`, `filterPapers`, `sortPapers` |
| `providers/arxiv.test.ts` | `searchArxiv` with mocked `fetch` |
| `providers/semanticScholar.test.ts` | `searchSemanticScholar` with mocked `fetch`, retry behavior |
| `providers/pubmed.test.ts` | `searchPubMed` with mocked `fetch`, esearch + efetch flow |
| `AcademicSearchService.test.ts` | Orchestration logic only: provider selection, merging, error fallback, caching |

---

## Reusability Wins

- `utils/xmlParsing.ts` can be reused by any future service that parses XML (e.g., RSS feeds, OAI-PMH).
- `utils/paperProcessing.ts` contains generic collection operations that could apply to other academic data sources.
- Each provider is self-contained: add a new source (e.g., OpenAlex, Crossref) by adding one file and one line in the orchestrator.

---

## Backward Compatibility

All existing imports remain valid:

```ts
// These continue to work unchanged
internal._services.search.AcademicSearchService.searchInternal
internal._services.search.AcademicSearchService.discoverAcademicPapersInternal
```

The main file continues to export the same `internalAction` objects. Internal handler functions (`searchInternalHandler`, `discoverAcademicPapersInternalHandler`) remain exported for testability.

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Moving code breaks import paths | Update all relative imports in the main file to point to new modules; run `typecheck:convex` |
| Splitting tests misses edge cases | Port every existing test case into the appropriate new file; add at least one integration test in the main file |
| Accidentally changes behavior | No logic changes during move; verify with existing test suite before and after |

---

## Success Criteria

1. `AcademicSearchService.ts` is under 250 lines.
2. Each new file has a single, clearly documented responsibility.
3. All existing call sites compile without changes.
4. `bun run typecheck:convex` passes.
5. `bun run test:convex` passes (all existing tests ported + new unit tests for providers).

---

## Out of Scope

- Adding new academic sources (e.g., OpenAlex).
- Changing scoring algorithms or filter behavior.
- Modifying the caching strategy.
- Renaming the public Convex action exports.
