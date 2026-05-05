# Refactor: Decompose convex/documents/index.ts

## Problem
`convex/documents/index.ts` has grown to 1,119 lines, mixing:
- Public CRUD operations (upload, get, list, update, remove)
- Content retrieval (getContent, getSignedUrl)
- Chunk storage and retrieval (storeChunk, listChunksByDocument, etc.)
- Search (keywordSearch, fetchChunks)
- External source ingestion (addExternalSources)
- Source guide generation (getSourceGuide, setSourceGuide)
- Internal state mutations (updateStatus, updateTitle, patch, etc.)
- Embedding pipeline helpers (prepareDocumentReembed, getDocumentDetails)
- Access control helpers (userCanAccessStorage)

This violates SRP and makes the file hard to navigate and maintain.

## Design

### File Structure
```
convex/documents/
  index.ts              # Barrel file: re-exports to preserve api.documents.index.* paths
  _helpers.ts           # Shared utilities (deleteAllChunksForDocument, FILE_EXTENSIONS)
  public.ts             # Public CRUD: upload, get, list, update, remove, removeMany, generateUploadUrl
  content.ts            # Content retrieval: getContent, getSignedUrl
  chunks.ts             # Chunk CRUD: storeChunk, listChunksByDocument, getChunks, listChunksByNotebook
  search.ts             # Search: keywordSearch, fetchChunks
  sources.ts            # External sources: addExternalSources
  guide.ts              # Source guide: getSourceGuide, setSourceGuide, getDocumentInternal, getDocumentChunksInternal
  internalOps.ts        # Internal state mutations: updateStatus, updateTitle, updateMetadata, patch, setExtractedMarkdown, setDocumentFileUrl
  refresh.ts            # Refresh pipeline: prepareDocumentReembed, listDocumentsForNotebookRefresh, getDocumentForRefresh, listDocumentsForNotebookReadInternal, getDocumentDetails, getDocumentsByIds, userCanAccessStorage
```

### API Path Preservation
All existing `api.documents.index.*` and `internal.documents.index.*` paths are preserved by keeping `index.ts` as a barrel file that re-exports from submodules. No frontend or other Convex file references need updating.

### Cohesion Rules
- **public.ts**: User-facing mutations and queries
- **content.ts**: Anything related to serving document content to users
- **chunks.ts**: Everything touching the `documentChunks` table
- **search.ts**: RAG retrieval (keyword + fetch)
- **sources.ts**: Adding external discovered sources
- **guide.ts**: Source guide generation and storage
- **internalOps.ts**: State machine mutations called by embedding jobs
- **refresh.ts**: Document refresh/re-embed pipeline helpers
- **_helpers.ts**: Pure utilities used by multiple modules (not Convex functions)

### Implementation Plan
1. Create `_helpers.ts` with `deleteAllChunksForDocument` and `FILE_EXTENSIONS`
2. Create submodules by moving related function groups
3. Update `index.ts` to re-export from submodules
4. Delete migrated code from `index.ts`
5. Run `bun run typecheck:convex` to verify

## Risks & Mitigation
- **Risk**: Breaking API paths for frontend/internal callers
  - **Mitigation**: Barrel file preserves all paths; zero changes needed in callers
- **Risk**: Circular dependencies between submodules
  - **Mitigation**: `_helpers.ts` is the only shared dependency; no submodule imports from another submodule

## Success Criteria
- `index.ts` under 50 lines (barrel only)
- All existing `api.documents.index.*` and `internal.documents.index.*` references continue to work
- `bun run typecheck:convex` passes
- No behavioral changes
