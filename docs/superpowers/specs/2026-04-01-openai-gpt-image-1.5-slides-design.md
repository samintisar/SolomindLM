# Design: Switch Slide Generation to OpenAI gpt-image-1.5

**Date**: 2026-04-01
**Status**: Approved
**Author**: Claude Code + User Collaboration

## Context

The current slide generation system uses ZhipuAI's `glm-image` model to generate slide images with text rendering. This approach has several limitations:
- Strict rate limits (~6 images/minute) requiring 10-second delays between requests
- Sequential processing (concurrency=1) makes generation slow
- Text rendering quality varies
- ZhipuAI SDK has stability issues

User requirements:
- ✅ Switch to OpenAI's `gpt-image-1.5` model
- ✅ Very good text rendering capabilities
- ✅ Minimize costs
- ❌ No backward compatibility needed

## Solution Overview

Replace ZhipuAI SDK with OpenAI SDK for slide image generation, leveraging:
- **Higher rate limits**: 5-250 images/minute (vs ~6/minute)
- **Better text rendering**: OpenAI's model optimized for text in images
- **Faster generation**: Can process 2-3 slides in parallel
- **Lower costs**: More efficient + medium quality setting

## Configuration

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Model | `gpt-image-1.5` | OpenAI's latest image generation model |
| Size | `1536x1024` | 16:9 landscape, closest to current 1728x960 |
| Quality | `medium` | Balanced text quality and cost (not `high`) |
| Format | `png` | Lossless, best for text rendering |
| Concurrency | 2 slides (start) | Conservative start, increase to 3 after testing |

## Architecture

### Component: SlideImageGenerationService

**Location**: `convex/_agents/slides/services/SlideImageGenerationService.ts`

**Responsibilities**:
- Generate slide images using OpenAI API
- Handle rate limiting and retries
- Upload images to Convex storage
- Log generation progress

**Key Changes**:

1. **Constructor**
   - Replace `ZhipuAI` client with `OpenAI` client
   - Accept `OPENAI_API_KEY` instead of `ZHIPU_API_KEY`
   - Remove ZhipuAI-specific initialization

2. **generateSlideImage() method**
   - Use OpenAI's `/v1/images/generations` endpoint
   - Request structure:
     ```typescript
     {
       model: "gpt-image-1.5",
       prompt: string,
       size: "1536x1024",
       quality: "medium",
       n: 1
     }
     ```
   - Parse OpenAI response structure (differs from ZhipuAI)
   - Handle OpenAI-specific error codes

3. **Response Parsing**
   - OpenAI returns: `{ data: [{ url: string }] }`
   - Fetch image from URL (same as current)
   - Convert to Buffer (same as current)

4. **generateSlideImages() method**
   - Increase concurrency from 1 to 2 (can increase to 3 after testing)
   - Reduce delays from 10s to 1s
   - Implement exponential backoff on 429 errors

### Error Handling

| Error Code | Meaning | Handling |
|------------|---------|----------|
| 400 | Invalid request | Fail fast, log error, abort |
| 429 | Rate limit | Exponential backoff: 2s → 4s → 8s → 16s |
| 500 | Server error | Retry up to 2 times with backoff |
| 401 | Invalid API key | Fail fast, log configuration error |

### Rate Limiting Strategy

**Current (ZhipuAI)**:
- Sequential generation (concurrency=1)
- 10-second fixed delay between slides
- ~1 slide per 10-12 seconds

**Proposed (OpenAI)**:
- Concurrency: 2 slides in parallel (can increase to 3 after testing)
- Batch delay: 1 second between batches
- Exponential backoff on 429 errors
- Estimated: 2 slides per 3-5 seconds (3-5x faster)

**Tier-based optimization**:
- Tier 1 (5 IPM): Concurrency=2, delay=2s
- Tier 2 (20 IPM): Concurrency=3, delay=1s
- Tier 3+ (50+ IPM): Can increase to concurrency=5

## File Modifications

### 1. SlideImageGenerationService.ts

**Changes**:
- Replace `import ZhipuAI from 'zhipuai'` with `import OpenAI from 'openai'`
- Update constructor signature
- Rewrite `generateSlideImage()` for OpenAI API
- Update error handling for OpenAI error codes
- Modify `generateSlideImages()` for increased concurrency
- Update all log messages to reference OpenAI instead of ZhipuAI

**Lines to change**: ~150 lines (entire file)

### 2. SlideDeckGraph.ts

**Changes**:
- Update service instantiation to pass `OPENAI_API_KEY`
- Remove `ZHIPU_API_KEY` reference

**Lines to change**: ~5 lines

### 3. .env

**Changes**:
- Add `OPENAI_API_KEY=<your-key-here>` if not present
- Optionally remove `ZHIPU_API_KEY` if unused elsewhere

### 4. env.ts

**Changes**:
- Verify `OPENAI_API_KEY` is exported (likely already present)
- No changes needed if already exported

## Cost Comparison

### ZhipuAI (Current)
- Rate limited to ~6 images/minute
- Sequential processing wastes time
- Quality varies

### OpenAI gpt-image-1.5
- **Tier 1**: 5 IPM × $0.04/image = $0.20/minute max
- **Tier 2**: 20 IPM × $0.04/image = $0.80/minute max
- Medium quality reduces cost vs high quality
- Faster generation = less compute overhead

**Estimated savings**: 30-50% due to efficiency gains

## Testing Strategy

### Unit Tests
- Mock OpenAI API responses
- Test error handling (400, 429, 500)
- Verify request parameter formatting

### Integration Tests
- Generate sample slide deck with 5-10 slides
- Verify text rendering quality
- Measure generation time (should be 3-5x faster)
- Test rate limit handling

### Manual Testing
- Generate slides with complex layouts (multiple text blocks, bullet points)
- Verify text is crisp and readable
- Check image dimensions (1536x1024)
- Confirm no artifacts or distortions

## Rollout Plan

1. **Phase 1**: Implement changes in dev environment
2. **Phase 2**: Test with sample slide decks
3. **Phase 3**: Deploy to production with monitoring
4. **Phase 4**: Monitor costs and quality, adjust parameters if needed

## Success Criteria

- ✅ Slides generate with crisp, readable text
- ✅ Generation time reduced by 3-5x
- ✅ No increase in error rate
- ✅ Costs remain flat or decrease
- ✅ All existing slide prompts work without modification

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Text quality lower than expected | High | Test extensively before production, have fallback to ZhipuAI ready |
| Rate limit tier is low (Tier 1) | Medium | Start conservative, monitor and adjust based on actual limits |
| OpenAI API instability | Medium | Implement robust retries, have ZhipuAI fallback ready |
| Resolution change affects layout | Low | 1536x1024 is still high quality, aspect ratio preserved |

## Future Considerations

- If text quality is insufficient, consider `quality: "high"` (higher cost)
- Can increase concurrency if rate limit tier is high
- May experiment with `size: "1792x1024"` for more resolution
- Consider implementing hybrid approach (OpenAI for most slides, fallback for complex ones)

## References

- [OpenAI Image API Docs](https://developers.openai.com/api/docs/guides/image-generation)
- [gpt-image-1.5 Model Reference](https://developers.openai.com/api/docs/models/gpt-image-1.5)
- Current implementation: `convex/_agents/slides/services/SlideImageGenerationService.ts`
