# Design: Migrate Slides to Together AI Infographic

**Date**: 2026-05-01
**Status**: Approved
**Author**: Claude Code + User Collaboration

## Context

The current slide generation system uses OpenAI's `gpt-image-1.5` via the OpenAI SDK to generate multiple presentation slides. The user wants to:

1. Migrate image generation from OpenAI SDK to **Together AI** (using `openai/gpt-image-1.5`)
2. Replace multi-slide deck with a **single infographic**
3. Update UI from presentation viewer to infographic viewer

## Goals

- ✅ Use Together AI for image generation (consistent with other AI services)
- ✅ Generate a single infographic instead of multi-slide deck
- ✅ Preserve map-reduce pattern for large document handling
- ✅ Modern, clean infographic UI matching app design principles
- ✅ Maintain warm vintage aesthetic

## Solution Overview

Replace the multi-phase slide generation pipeline with a simplified single-image pipeline:

1. **Map Phase** (preserved): Process document chunks in parallel via FAST_LLM
2. **Reduce Phase** (simplified): Synthesize all map results into a single infographic prompt via SMART_LLM
3. **Image Generation**: Call Together AI once with `openai/gpt-image-1.5`
4. **Storage**: Store single image URL

## Architecture

### Backend Pipeline

```
User Request
  ↓
Mutation: create placeholder record (status: "generating")
  ↓
Action: fetch document chunks
  ↓
Map Phase (parallel):
  - For each chunk: FAST_LLM extracts key infographic elements
  - Store map results in metadata
  ↓
Reduce Phase (single call):
  - SMART_LLM synthesizes all elements into single infographic prompt
  - Output: { title, infographicPrompt }
  ↓
Image Generation:
  - Together AI client.images.generate({
      model: "openai/gpt-image-1.5",
      prompt: infographicPrompt,
      size: "1536x1024",
      quality: "medium",
      n: 1
    })
  - Handle base64 response → Buffer → ctx.storage.store()
  ↓
Save: patch DB record with imageUrl, title, status: "completed"
```

### Component: TogetherImageService

**Location**: `convex/_services/ai/togetherImages.ts`

**Responsibilities**:
- Generate images using Together AI API
- Handle rate limiting and retries
- Upload images to Convex storage

**Interface**:
```typescript
export async function generateInfographicImage(
  client: Together,
  params: {
    prompt: string;
    size?: string;
    quality?: string;
    timeoutMs?: number;
  }
): Promise<{ imageUrl: string; storageId: string }>
```

### Component: InfographicGenerationService

**Location**: `convex/studio/infographic/`

**Responsibilities**:
- Orchestrate map-reduce pipeline
- Generate infographic prompt from document content
- Call TogetherImageService for image generation

**Key Files**:
- `convex/studio/infographic/index.ts` — Mutation + queries
- `convex/studio/infographic/generate.ts` — Main generation action
- `convex/studio/infographic/prompts.ts` — LLM prompts for map/reduce

### Map Phase Prompt

Extract key elements from each chunk that would appear in an infographic:
- Statistics / data points
- Key concepts / definitions
- Timeline events
- Comparisons / contrasts
- Important quotes
- Source references

Output schema: `InfographicElementArraySchema`

### Reduce Phase Prompt

Synthesize all extracted elements into a single detailed gpt-image-1.5 prompt:
- Design a cohesive infographic layout
- Specify typography, colors, visual hierarchy
- Include all key data points
- Specify exact text content in quotation marks
- Match warm vintage aesthetic

Output schema: `{ title: string, infographicPrompt: string }`

## Configuration

| Parameter   | Value                    | Rationale                                       |
| ----------- | ------------------------ | ----------------------------------------------- |
| Model       | `openai/gpt-image-1.5`   | Together AI hosted OpenAI image model           |
| Size        | `1536x1024`              | 16:9 landscape, optimal for infographics        |
| Quality     | `medium`                 | Balanced quality and cost                       |
| Format      | base64 (default)         | Together AI returns base64 for this model       |
| Map LLM     | `openai/gpt-oss-20b`     | FAST_LLM for parallel chunk processing          |
| Reduce LLM  | `openai/gpt-oss-120b`    | SMART_LLM for prompt synthesis                  |

## Database Schema

Reuse existing `slides` table (to avoid migration):

```typescript
slides: defineTable({
  userId: v.id("users"),
  notebookId: v.id("notebooks"),
  title: v.string(),
  data: v.any(),           // { imageUrl, prompt, metadata }
  status: v.string(),      // 'generating' | 'completed' | 'failed'
  metadata: v.optional(v.any()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
```

**Data shape** (stored in `data` field):
```typescript
{
  imageUrl: string,        // Convex storage public URL
  title: string,
  prompt: string,          // The gpt-image-1.5 generation prompt
  metadata: {
    sourceDocumentIds: string[],
    generatedAt: number,
    mapResultsCount: number,
    customPrompt?: string,
  }
}
```

## Frontend Changes

### 1. InfographicView Component

**Location**: `apps/web/src/features/studio/components/views/InfographicView.tsx`

**Features**:
- Single image display in card container
- Responsive sizing (max-width with maintained aspect ratio)
- Zoom controls (+/− buttons, scroll zoom)
- Fullscreen toggle (F key)
- Download button
- Title display
- Generation metadata (collapsible)
- Loading skeleton state
- Error state with retry

**Design**:
- Card: `bg-card border-border rounded-xl shadow-md`
- Image container: `bg-black rounded-lg overflow-hidden`
- Controls: `bg-secondary hover:bg-secondary/80 rounded-xl`
- Typography: `font-display` for title, `font-sans` for UI

### 2. Studio Integration

**Rename** "Slides" → "Infographic":
- `apps/web/src/features/studio/hooks/useStudioHandlers.ts`
- `apps/web/src/features/studio/components/CustomizeSlidesModal.tsx` → `CustomizeInfographicModal.tsx`
- `apps/web/src/features/studio/hooks/flows/useCreateSlidesFlow.ts` → `useCreateInfographicFlow.ts`

**Simplify modal**:
- Remove `slideType` and `deckLength` options
- Keep `customPrompt` for style guidance
- Single "Generate Infographic" button

### 3. API Layer

**Location**: `apps/web/src/features/studio/services/infographicApi.ts`

```typescript
useInfographics(notebookId)     // List infographics
useInfographic(infographicId)   // Get single infographic
useCreateInfographic()          // Create + generate
useRenameInfographic()          // Rename
useDeleteInfographic()          // Delete
```

### 4. Type Updates

**Location**: `apps/web/src/shared/types/index.ts`

```typescript
export interface InfographicNote extends BaseNote {
  type: "infographic";
  imageUrl: string;
  title: string;
  prompt?: string;
  metadata: {
    sourceDocumentIds: string[];
    generatedAt: number;
    customPrompt?: string;
  };
}
```

## Removed Code

**Delete**:
- `convex/studio/slides/job.ts`
- `convex/studio/slides/slideDeckJobPhases.ts`
- `convex/studio/slides/index.ts` (replace with new version)
- `convex/_agents/slides/` (entire directory)
- `apps/web/src/features/studio/components/views/SlidesView.tsx`
- `apps/web/src/features/studio/services/slidesApi.ts`
- `apps/web/src/features/studio/hooks/flows/useCreateSlidesFlow.ts`
- `apps/web/src/features/studio/components/CustomizeSlidesModal.tsx`

**Update references**:
- Studio panel tool list
- Note type routing
- Type definitions

## Error Handling

| Error Code | Meaning         | Handling                                |
| ---------- | --------------- | --------------------------------------- |
| 400        | Invalid request | Fail fast, log error, abort             |
| 429        | Rate limit      | Exponential backoff: 2s → 4s → 8s       |
| 500        | Server error    | Retry up to 2 times with backoff        |
| Timeout    | >3 minutes      | Fail, store error in metadata           |

## Testing Strategy

### Unit Tests
- Mock Together AI API responses
- Test error handling
- Verify request formatting

### Integration Tests
- Generate infographic from sample document
- Verify text rendering quality
- Test with large documents (map-reduce)

### Manual Testing
- Verify warm vintage aesthetic
- Test zoom/scroll interactions
- Test fullscreen and download
- Verify mobile responsiveness

## Rollout Plan

1. **Phase 1**: Implement backend changes (Together AI service, simplified pipeline)
2. **Phase 2**: Implement frontend (InfographicView, studio integration)
3. **Phase 3**: Remove old slide code
4. **Phase 4**: Test end-to-end with sample documents
5. **Phase 5**: Deploy to production

## Success Criteria

- ✅ Infographic generates with crisp, readable text
- ✅ Single image instead of multi-slide deck
- ✅ Map-reduce handles large documents correctly
- ✅ UI matches app design principles (warm vintage, modern)
- ✅ Together AI integration works reliably
- ✅ No regression in other studio tools

## Risks & Mitigations

| Risk                             | Impact | Mitigation                                              |
| -------------------------------- | ------ | ------------------------------------------------------- |
| Together AI rate limits          | Medium | Implement exponential backoff, monitor usage            |
| Image quality issues             | High   | Test extensively, can tune prompt or switch to `high`   |
| Large document handling          | Medium | Map-reduce preserved, test with 50+ page documents      |
| UI responsiveness with large img | Low    | Implement lazy loading, zoom limits                     |

## References

- Together AI Images API: `convex/_services/ai/togetherTts.ts` (existing Together client pattern)
- Current slide implementation: `convex/studio/slides/`
- App design tokens: `apps/web/src/index.css`
- Together Images skill: `.agents/skills/together-images/`
