# Embedding Migration: OpenAI → Together AI

## Overview

This migration updates the embedding service from OpenAI's `text-embedding-3-small` (1536 dimensions) to Together AI's `intfloat/multilingual-e5-large-instruct` (1024 dimensions).

## Changes Made

### 1. Embedding Service (`convex/_services/processing/EmbeddingServiceClient.ts`)
- Replaced LangChain's `OpenAIEmbeddings` with Together AI SDK
- Updated model to: `intfloat/multilingual-e5-large-instruct`
- Updated dimensions: `1536` → `1024`
- Optimized batch processing for Together AI (100 texts per batch)

### 2. Schema Update (`convex/schema.ts`)
- Updated `documentChunks` vector index dimensions from 1536 to 1024

### 3. Migration Scripts (`convex/_migration/`)
- `reembedChunks.ts` - Actions to re-embed all existing documents
- `index.ts` - Helper functions for migration queries and mutations

## Migration Steps

### 1. Check Migration Status
```bash
# Run this internal query to see how many chunks need migration (requires deploy access)
bun x convex run internal._migration.index.getMigrationStatus
```

### 2. Test Migration on Single Document
```bash
# Test on a single document first
npx convex run _migration:reembedDocumentChunks --documentId=<YOUR_DOCUMENT_ID>
```

### 3. Run Full Migration
```bash
# Re-embed all document chunks
npx convex run _migration:reembedAllChunks
```

### 4. Verify Migration
```bash
# Check that all chunks now have 1024 dimensions
bun x convex run internal._migration.index.getMigrationStatus
```

## Model Details

### Together AI intfloat/multilingual-e5-large-instruct
- **Dimensions**: 1024 (vs OpenAI's 1536)
- **Context**: 514 tokens
- **Size**: 560M parameters
- **Specialty**: Multilingual retrieval (recommended for all languages)

### Important Notes
- E5 embeddings are normalized, so cosine similarity and dot product give equivalent rankings
- Use the same model for both indexing and querying
- Input text beyond 514 tokens is truncated silently

## Testing After Migration

1. **Vector Search**: Verify chat and search features work correctly
2. **RAG Quality**: Check that citations and retrieval are accurate
3. **Performance**: Monitor embedding generation speed and cost

## Rollback Plan

If issues occur, you can rollback by:
1. Reverting code changes to EmbeddingServiceClient.ts and schema.ts
2. Running the migration script again with old OpenAI service
3. Re-deploying Convex functions

## Cost Impact

Together AI embeddings are typically more cost-effective than OpenAI's. The exact cost difference depends on usage volume.

## Support

For issues with Together AI, refer to:
- [Together AI Embeddings Docs](https://docs.together.ai/docs/embeddings-overview)
- [Migration Script Source](convex/_migration/reembedChunks.ts)
