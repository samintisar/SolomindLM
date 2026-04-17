# Switch Slide Generation to OpenAI gpt-image-1.5 - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace ZhipuAI's glm-image model with OpenAI's gpt-image-1.5 for slide image generation, improving text rendering quality and generation speed while reducing costs.

**Architecture:** Direct SDK replacement in `SlideImageGenerationService` class. Replace ZhipuAI client with OpenAI client, update API call structure to match OpenAI's `/v1/images/generations` endpoint, adjust rate limiting from 10s sequential delays to 2 concurrent with 1s batch delays, implement OpenAI-specific error handling with exponential backoff on 429 errors.

**Tech Stack:** OpenAI Node SDK, TypeScript, Convex backend, existing slide generation pipeline

---

## File Structure

**Creating:** None
**Modifying:**

- `convex/_agents/slides/services/SlideImageGenerationService.ts` - Core image generation service class
- `convex/_agents/slides/SlideDeckGraph.ts` - Graph class that instantiates the service
- `.env` - Environment variables (local file, not in git)
- `convex/_lib/env.ts` - Verify OPENAI_API_KEY export

**Key Interfaces (preserved):**

```typescript
class SlideImageGenerationService {
  async generateSlideImage(prompt: string, slideNumber: number): Promise<Buffer>;
  async uploadImage(imageBuffer: Buffer, slideNumber: number, slideDeckId: string): Promise<string>;
  async generateSlideImages(
    slides: Slide[],
    slideDeckId: string,
    concurrency?: number
  ): Promise<Slide[]>;
}
```

---

## Task 1: Install OpenAI SDK Dependency

**Files:**

- Modify: `package.json` (root)

**Context:** The project uses Bun as package manager. OpenAI SDK is required for image generation API calls.

- [ ] **Step 1: Install OpenAI SDK**

Run: `bun add openai`

Expected: Output shows installation success, package.json updated with `"openai": "^latest"`

- [ ] **Step 2: Verify installation**

Run: `cat package.json | grep openai`

Expected: `"openai": "^4.x.x"` or similar version appears in dependencies

- [ ] **Step 3: Commit**

```bash
git add package.json bun.lockb
git commit -m "deps: add openai sdk for slide image generation"
```

---

## Task 2: Update Environment Variables

**Files:**

- Modify: `.env`
- Verify: `convex/_lib/env.ts`

**Context:** Need OPENAI_API_KEY for authentication. ZHIPU_API_KEY can be removed if unused elsewhere.

- [ ] **Step 1: Check if OPENAI_API_KEY exists in .env**

Run: `grep OPENAI_API_KEY .env`

Expected: Either line exists or no output

- [ ] **Step 2: Add OPENAI_API_KEY if missing**

If step 1 showed no output, append to `.env`:

```bash
echo "OPENAI_API_KEY=your-key-here" >> .env
```

Then edit `.env` and replace `your-key-here` with actual key.

If step 1 showed the line exists, skip this step.

- [ ] **Step 3: Verify OPENAI_API_KEY is exported in env.ts**

Read: `convex/_lib/env.ts`

Look for line: `OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',`

Expected: Line already exists in env object (should be around line 8)

If missing, add it after the `// OpenAI` comment.

- [ ] **Step 4: Push environment variables to Convex dev**

Run: `bun run convex:env:push`

Expected: Output shows each variable being pushed, including `OPENAI_API_KEY`

- [ ] **Step 5: Commit .env changes (if modified)**

```bash
git add .env
git commit -m "feat: add OPENAI_API_KEY for slide generation"
```

Note: If .env was already modified and has uncommitted changes, this will include them.

---

## Task 3: Read Current SlideImageGenerationService Implementation

**Files:**

- Read: `convex/_agents/slides/services/SlideImageGenerationService.ts`

**Context:** Need to understand current implementation before rewriting. This is a read-only task to prepare for modifications.

- [ ] **Step 1: Read full service file**

Use Serena's `find_symbol` tool to read the full class:

Read: `convex/_agents/slides/services/SlideImageGenerationService.ts` lines 1-302

Pay attention to:

- Constructor (how ZhipuAI client is initialized)
- `generateSlideImage()` method (API call structure)
- Error handling patterns
- `generateSlideImages()` method (concurrency and delays)
- Retry logic

Expected: Complete understanding of current ZhipuAI implementation

No commit for this task (read-only)

---

## Task 4: Replace Constructor and Imports

**Files:**

- Modify: `convex/_agents/slides/services/SlideImageGenerationService.ts`

**Context:** Replace ZhipuAI SDK import and client initialization with OpenAI SDK.

- [ ] **Step 1: Replace import statement**

Current (around line 1-3):

```typescript
import ZhipuAI from "zhipuai";
```

Replace with:

```typescript
import OpenAI from "openai";
```

- [ ] **Step 2: Update constructor parameter and client initialization**

Current constructor (around lines 18-30):

```typescript
constructor(apiKey: string, uploadStorage: (buffer: Buffer, fileName: string) => Promise<string>) {
  if (!apiKey || apiKey.trim().length === 0) {
    logWarn(
      {
        agent: 'SlideDeckGraph',
        phase: 'image_service_init',
      } as any,
      'ZhipuAI API key not configured - image generation will be skipped'
    );
  }
  this.client = new ZhipuAI({ apiKey });
  this.uploadStorage = uploadStorage;
}
```

Replace with:

```typescript
constructor(apiKey: string, uploadStorage: (buffer: Buffer, fileName: string) => Promise<string>) {
  if (!apiKey || apiKey.trim().length === 0) {
    logWarn(
      {
        agent: 'SlideDeckGraph',
        phase: 'image_service_init',
      } as any,
      'OpenAI API key not configured - image generation will be skipped'
    );
  }
  this.client = new OpenAI({ apiKey });
  this.uploadStorage = uploadStorage;
}
```

- [ ] **Step 3: Update client property type declaration**

Current (around line 20):

```typescript
private client: ZhipuAI;
```

Replace with:

```typescript
private client: OpenAI;
```

- [ ] **Step 4: Commit constructor changes**

```bash
git add convex/_agents/slides/services/SlideImageGenerationService.ts
git commit -m "refactor: replace ZhipuAI with OpenAI client in constructor"
```

---

## Task 5: Rewrite generateSlideImage() Method

**Files:**

- Modify: `convex/_agents/slides/services/SlideImageGenerationService.ts`

**Context:** Replace ZhipuAI API call with OpenAI API call. OpenAI uses `/v1/images/generations` endpoint with different request/response structure.

- [ ] **Step 1: Replace API call in generateSlideImage()**

Current method body (around lines 36-110):

```typescript
async generateSlideImage(prompt: string, slideNumber: number): Promise<Buffer> {
  const startTime = Date.now();

  logInfo(
    {
      agent: 'SlideDeckGraph',
      phase: 'image_generation',
      slideNumber,
      promptLength: prompt.length,
    } as any,
    `Generating slide ${slideNumber} with ZhipuAI glm-image...`
  );

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
    try {
      const response = await invokeWithTimeout(
        async () => {
          try {
            return await this.client.createImages({
              model: 'glm-image',
              prompt: prompt,
              size: '1728x960',
              n: 1,
            });
          } catch (apiError: any) {
            const errorMessage =
              apiError?.message ||
              apiError?.error?.message ||
              apiError?.response?.data?.error?.message ||
              String(apiError);
            throw new Error(`ZhipuAI API error: ${errorMessage}`);
          }
        },
        GRAPH_CONFIG.IMAGE_TIMEOUT_MS,
        'ZhipuAIImageGen'
      );

      let imageUrl: string | undefined;
      const firstItem = response.data?.[0];

      if (typeof firstItem === 'string') {
        imageUrl = firstItem;
      } else if (typeof firstItem === 'object' && firstItem !== null && 'url' in firstItem) {
        imageUrl = (firstItem as { url: string }).url;
      } else if (typeof firstItem === 'object' && firstItem !== null && 'b64_json' in firstItem) {
        throw new Error('ZhipuAI returned base64 image instead of URL - not yet supported');
      }

      if (!imageUrl || typeof imageUrl !== 'string') {
        throw new Error('Unexpected response format from ZhipuAI SDK: no image URL returned');
      }

      const imageResponse = await fetch(imageUrl);

      if (!imageResponse.ok) {
        throw new Error(`Failed to fetch image from URL: ${imageResponse.statusText}`);
      }
      const arrayBuffer = await imageResponse.arrayBuffer();
      const imageData = Buffer.from(arrayBuffer);

      const elapsed = Date.now() - startTime;
      logInfo(
        {
          agent: 'SlideDeckGraph',
          phase: 'image_generation',
          slideNumber,
          attempt,
          imageSize: imageData.length,
          processingTimeMs: elapsed,
        } as any,
        `Slide ${slideNumber} generated successfully (${(imageData.length / 1024).toFixed(2)} KB)`
      );

      return imageData;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      let errorDetails: any;
      if (error instanceof Error) {
        errorDetails = {
          message: error.message,
          name: error.name,
          stack: error.stack?.split('\\n').slice(0, 3).join('\\n'),
        };
      } else if (typeof error === 'object' && error !== null) {
        errorDetails = JSON.parse(JSON.stringify(error));
      } else {
        errorDetails = { error: String(error) };
      }

      logWarn(
        {
          agent: 'SlideDeckGraph',
          phase: 'image_generation',
          slideNumber,
          attempt,
          error: errorDetails,
        } as any,
        `Attempt ${attempt}/${this.maxRetries} failed for slide ${slideNumber}: ${lastError.message}`
      );

      if (attempt < this.maxRetries) {
        const baseDelay = 2000;
        const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), 15000);
        logInfo(
          {
            agent: 'SlideDeckGraph',
            phase: 'image_generation',
            slideNumber,
            attempt,
            delayMs: delay,
          } as any,
          `Waiting ${delay}ms before retry ${attempt + 1}/${this.maxRetries}...`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  logError(
    {
      agent: 'SlideDeckGraph',
      phase: 'image_generation',
      slideNumber,
      error: lastError?.message,
    } as any,
    `Failed to generate slide ${slideNumber} after ${this.maxRetries} attempts`
  );

  throw lastError || new Error('Failed to generate slide image');
}
```

Replace with:

```typescript
async generateSlideImage(prompt: string, slideNumber: number): Promise<Buffer> {
  const startTime = Date.now();

  logInfo(
    {
      agent: 'SlideDeckGraph',
      phase: 'image_generation',
      slideNumber,
      promptLength: prompt.length,
    } as any,
    `Generating slide ${slideNumber} with OpenAI gpt-image-1.5...`
  );

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
    try {
      const response = await invokeWithTimeout(
        async () => {
          try {
            return await this.client.images.generate({
              model: 'gpt-image-1.5',
              prompt: prompt,
              size: '1536x1024',
              quality: 'medium',
              n: 1,
            });
          } catch (apiError: any) {
            // Handle OpenAI-specific error structure
            const errorMessage =
              apiError?.message ||
              apiError?.error?.message ||
              apiError?.response?.data?.error?.message ||
              String(apiError);

            // Check for specific error codes
            const statusCode = apiError?.status || apiError?.response?.status;

            if (statusCode === 401) {
              throw new Error(`OpenAI authentication failed: ${errorMessage}`);
            } else if (statusCode === 400) {
              throw new Error(`OpenAI invalid request: ${errorMessage}`);
            } else if (statusCode === 429) {
              // Rate limit error - preserve for retry logic
              throw apiError;
            } else {
              throw new Error(`OpenAI API error: ${errorMessage}`);
            }
          }
        },
        GRAPH_CONFIG.IMAGE_TIMEOUT_MS,
        'OpenAIImageGen'
      );

      // OpenAI returns { data: [{ url: string }] }
      const imageUrl = response.data[0]?.url;

      if (!imageUrl || typeof imageUrl !== 'string') {
        throw new Error('Unexpected response format from OpenAI SDK: no image URL returned');
      }

      const imageResponse = await fetch(imageUrl);

      if (!imageResponse.ok) {
        throw new Error(`Failed to fetch image from URL: ${imageResponse.statusText}`);
      }
      const arrayBuffer = await imageResponse.arrayBuffer();
      const imageData = Buffer.from(arrayBuffer);

      const elapsed = Date.now() - startTime;
      logInfo(
        {
          agent: 'SlideDeckGraph',
          phase: 'image_generation',
          slideNumber,
          attempt,
          imageSize: imageData.length,
          processingTimeMs: elapsed,
        } as any,
        `Slide ${slideNumber} generated successfully (${(imageData.length / 1024).toFixed(2)} KB)`
      );

      return imageData;
    } catch (error: any) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check for rate limit error (429)
      const isRateLimit = error?.status === 429 || error?.code === 'rate_limit_exceeded';

      let errorDetails: any;
      if (error instanceof Error) {
        errorDetails = {
          message: error.message,
          name: error.name,
          isRateLimit,
          stack: error.stack?.split('\n').slice(0, 3).join('\n'),
        };
      } else if (typeof error === 'object' && error !== null) {
        errorDetails = {
          ...JSON.parse(JSON.stringify(error)),
          isRateLimit,
        };
      } else {
        errorDetails = { error: String(error), isRateLimit };
      }

      logWarn(
        {
          agent: 'SlideDeckGraph',
          phase: 'image_generation',
          slideNumber,
          attempt,
          error: errorDetails,
        } as any,
        `Attempt ${attempt}/${this.maxRetries} failed for slide ${slideNumber}: ${lastError.message}${isRateLimit ? ' (rate limit)' : ''}`
      );

      // Fail fast on auth or invalid request errors
      if (error?.status === 401 || error?.status === 400) {
        break;
      }

      if (attempt < this.maxRetries) {
        // Use exponential backoff for rate limits, shorter for server errors
        const baseDelay = isRateLimit ? 2000 : 1000;
        const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), 16000);

        if (isRateLimit) {
          logInfo(
            {
              agent: 'SlideDeckGraph',
              phase: 'image_generation',
              slideNumber,
              attempt,
              delayMs: delay,
            } as any,
            `Rate limit hit. Waiting ${delay}ms before retry ${attempt + 1}/${this.maxRetries}...`
          );
        } else {
          logInfo(
            {
              agent: 'SlideDeckGraph',
              phase: 'image_generation',
              slideNumber,
              attempt,
              delayMs: delay,
            } as any,
            `Waiting ${delay}ms before retry ${attempt + 1}/${this.maxRetries}...`
          );
        }

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  logError(
    {
      agent: 'SlideDeckGraph',
      phase: 'image_generation',
      slideNumber,
      error: lastError?.message,
    } as any,
    `Failed to generate slide ${slideNumber} after ${this.maxRetries} attempts`
  );

  throw lastError || new Error('Failed to generate slide image');
}
```

- [ ] **Step 2: Update retry count for better rate limit handling**

Current (around line 22):

```typescript
private maxRetries = 1;
```

Replace with:

```typescript
private maxRetries = 2; // More retries for rate limit handling
```

- [ ] **Step 3: Commit generateSlideImage changes**

```bash
git add convex/_agents/slides/services/SlideImageGenerationService.ts
git commit -m "refactor: rewrite generateSlideImage to use OpenAI gpt-image-1.5

- Use OpenAI /v1/images/generations endpoint
- Set size to 1536x1024, quality to medium
- Add OpenAI-specific error handling (401, 400, 429, 500)
- Implement exponential backoff for rate limits
- Increase maxRetries to 2 for better recovery"
```

---

## Task 6: Rewrite generateSlideImages() Method for Concurrency

**Files:**

- Modify: `convex/_agents/slides/services/SlideImageGenerationService.ts`

**Context:** Update from sequential (concurrency=1, 10s delays) to parallel (concurrency=2, 1s batch delays).

- [ ] **Step 1: Replace generateSlideImages() method**

Current method (around lines 240-302):

```typescript
async generateSlideImages(
  slides: Slide[],
  slideDeckId: string,
  concurrency: number = 1
): Promise<Slide[]> {
  logInfo(
    {
      agent: 'SlideDeckGraph',
      phase: 'generate_slide_images',
      totalSlides: slides.length,
      concurrency,
    } as any,
    `Starting image generation for ${slides.length} slides...`
  );

  const DELAY_BETWEEN_REQUESTS_MS = 10000;
  const results: Slide[] = [];

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];

    try {
      if (i > 0) {
        logInfo(
          {
            agent: 'SlideDeckGraph',
            phase: 'generate_slide_images',
            slideNumber: slide.slideNumber,
          } as any,
          `Waiting ${DELAY_BETWEEN_REQUESTS_MS}ms before generating slide ${slide.slideNumber}...`
        );
        await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_REQUESTS_MS));
      }

      const imageBuffer = await this.generateSlideImage(slide.prompt, slide.slideNumber);

      const imageUrl = await this.uploadImage(imageBuffer, slide.slideNumber, slideDeckId);

      results.push({
        ...slide,
        imageUrl,
      } as Slide);
    } catch (error) {
      logError(
        {
          agent: 'SlideDeckGraph',
          phase: 'generate_slide_images',
          slideNumber: slide.slideNumber,
          slideTitle: slide.title,
          error: error instanceof Error ? error.message : String(error),
        } as any,
        `CRITICAL: Failed to generate image for slide ${slide.slideNumber}. Aborting slide deck generation.`
      );

      throw new Error(
        `Failed to generate image for slide ${slide.slideNumber} ("${slide.title}"): ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  const successCount = results.filter((s) => s.imageUrl && !s.imageUrl.includes('placeholder')).length;
  logInfo(
    {
      agent: 'SlideDeckGraph',
      phase: 'generate_slide_images',
      totalSlides: slides.length,
      successful: successCount,
      failed: slides.length - successCount,
    } as any,
    `Image generation complete: ${successCount}/${slides.length} slides generated`
  );

  return results;
}
```

Replace with:

```typescript
async generateSlideImages(
  slides: Slide[],
  slideDeckId: string,
  concurrency: number = 2
): Promise<Slide[]> {
  logInfo(
    {
      agent: 'SlideDeckGraph',
      phase: 'generate_slide_images',
      totalSlides: slides.length,
      concurrency,
    } as any,
    `Starting image generation for ${slides.length} slides with concurrency ${concurrency}...`
  );

  const DELAY_BETWEEN_BATCHES_MS = 1000;
  const results: Slide[] = [];

  // Process slides in batches
  for (let i = 0; i < slides.length; i += concurrency) {
    const batch = slides.slice(i, Math.min(i + concurrency, slides.length));

    logInfo(
      {
        agent: 'SlideDeckGraph',
        phase: 'generate_slide_images',
        batchStart: i,
        batchEnd: Math.min(i + concurrency, slides.length),
        batchSize: batch.length,
      } as any,
      `Processing batch ${Math.floor(i / concurrency) + 1}: slides ${i + 1}-${Math.min(i + concurrency, slides.length)}`
    );

    try {
      // Generate images in parallel within batch
      const batchResults = await Promise.all(
        batch.map(async (slide) => {
          try {
            const imageBuffer = await this.generateSlideImage(slide.prompt, slide.slideNumber);
            const imageUrl = await this.uploadImage(imageBuffer, slide.slideNumber, slideDeckId);

            logInfo(
              {
                agent: 'SlideDeckGraph',
                phase: 'generate_slide_images',
                slideNumber: slide.slideNumber,
                success: true,
              } as any,
              `Slide ${slide.slideNumber} completed successfully`
            );

            return {
              ...slide,
              imageUrl,
            } as Slide;
          } catch (error) {
            logError(
              {
                agent: 'SlideDeckGraph',
                phase: 'generate_slide_images',
                slideNumber: slide.slideNumber,
                slideTitle: slide.title,
                error: error instanceof Error ? error.message : String(error),
              } as any,
              `Failed to generate image for slide ${slide.slideNumber}`
            );

            // Re-throw to be caught by outer try-catch
            throw error;
          }
        })
      );

      results.push(...batchResults);

      // Add delay between batches (except after last batch)
      if (i + concurrency < slides.length) {
        logInfo(
          {
            agent: 'SlideDeckGraph',
            phase: 'generate_slide_images',
            nextBatchStart: i + concurrency,
            delayMs: DELAY_BETWEEN_BATCHES_MS,
          } as any,
          `Batch complete. Waiting ${DELAY_BETWEEN_BATCHES_MS}ms before next batch...`
        );
        await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_BATCHES_MS));
      }
    } catch (error) {
      logError(
        {
          agent: 'SlideDeckGraph',
          phase: 'generate_slide_images',
          batchStart: i,
          batchSize: batch.length,
          error: error instanceof Error ? error.message : String(error),
        } as any,
        `CRITICAL: Failed to generate images for batch starting at slide ${i + 1}. Aborting slide deck generation.`
      );

      throw new Error(
        `Failed to generate images for batch starting at slide ${i + 1}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  const successCount = results.filter((s) => s.imageUrl && !s.imageUrl.includes('placeholder')).length;
  logInfo(
    {
      agent: 'SlideDeckGraph',
      phase: 'generate_slide_images',
      totalSlides: slides.length,
      successful: successCount,
      failed: slides.length - successCount,
    } as any,
    `Image generation complete: ${successCount}/${slides.length} slides generated`
  );

  return results;
}
```

- [ ] **Step 2: Commit concurrency changes**

```bash
git add convex/_agents/slides/services/SlideImageGenerationService.ts
git commit -m "perf: update slide generation to use concurrency

- Change from sequential (concurrency=1) to parallel (concurrency=2)
- Replace 10s delays with 1s batch delays
- Process slides in batches using Promise.all
- Add detailed batch logging
- Expected 3-5x speedup in generation time"
```

---

## Task 7: Update Service Instantiation in SlideDeckGraph

**Files:**

- Modify: `convex/_agents/slides/SlideDeckGraph.ts` (or wherever service is instantiated)

**Context:** Update the code that creates SlideImageGenerationService to pass OPENAI_API_KEY instead of ZHIPU_API_KEY.

- [ ] **Step 1: Find where SlideImageGenerationService is instantiated**

Search for: `new SlideImageGenerationService`

Look in:

- `convex/_agents/slides/SlideDeckGraph.ts`
- `convex/_agents/slides/nodes.ts` (if SlideDeckGraph doesn't have it)

- [ ] **Step 2: Update the instantiation**

Find code that looks like:

```typescript
const imageService = new SlideImageGenerationService(env.ZHIPU_API_KEY, uploadStorage);
```

Replace with:

```typescript
const imageService = new SlideImageGenerationService(env.OPENAI_API_KEY, uploadStorage);
```

- [ ] **Step 3: Commit instantiation change**

```bash
git add convex/_agents/slides/SlideDeckGraph.ts
git commit -m "refactor: use OPENAI_API_KEY for slide image service"
```

---

## Task 8: Type Check and Build Verification

**Files:**

- Test: All modified files

**Context:** Ensure TypeScript compilation succeeds after all changes.

- [ ] **Step 1: Run TypeScript type check**

Run: `bun run typecheck:convex`

Expected: No type errors, output shows success

If errors occur:

1. Check that OpenAI import is correct
2. Verify client type declaration
3. Check method signatures match interface
4. Fix errors and re-run

- [ ] **Step 2: Build the project**

Run: `bun run build`

Expected: Build completes successfully

- [ ] **Step 3: Commit any type fixes**

If type errors were fixed:

```bash
git add convex/_agents/slides/
git commit -m "fix: resolve TypeScript errors from OpenAI integration"
```

If no errors, no commit needed.

---

## Task 9: Update Documentation and Comments

**Files:**

- Modify: `convex/_agents/slides/services/SlideImageGenerationService.ts`
- Modify: `CLAUDE.md` (if ZhipuAI is mentioned)

**Context:** Update code comments and project documentation to reflect OpenAI usage.

- [ ] **Step 1: Update class-level JSDoc comment**

Find the class comment above `export class SlideImageGenerationService`.

Current likely says:

```typescript
/**
 * Generate slide images using ZhipuAI glm-image model
 */
```

Replace with:

```typescript
/**
 * Generate slide images using OpenAI gpt-image-1.5 model
 *
 * Features:
 * - Model: gpt-image-1.5
 * - Size: 1536x1024 (16:9 landscape)
 * - Quality: medium (balanced text rendering and cost)
 * - Format: PNG (lossless for best text quality)
 * - Concurrency: 2 slides in parallel
 * - Rate limiting: 1s delay between batches, exponential backoff on 429
 */
```

- [ ] **Step 2: Update method JSDoc comments**

Find comment above `generateSlideImage()`:

Current:

```typescript
/**
 * Generate a slide image using ZhipuAI glm-image model.
 * Returns the image as a Buffer.
 */
```

Replace with:

```typescript
/**
 * Generate a slide image using OpenAI gpt-image-1.5 model.
 * Returns the image as a Buffer.
 *
 * @param prompt - Detailed slide description including text, layout, and style
 * @param slideNumber - Slide number for logging and error messages
 * @returns Promise<Buffer> - Image data in PNG format
 * @throws Error if generation fails after max retries
 */
```

- [ ] **Step 3: Update generateSlideImages() JSDoc**

Find comment above `generateSlideImages()`:

Current:

```typescript
/**
 * Generate all slide images sequentially with rate limiting.
 * Returns an array of slide objects with image URLs.
 *
 * Note: Processes slides sequentially (concurrency=1) with delays to avoid ZhipuAI API rate limits.
 */
```

Replace with:

```typescript
/**
 * Generate all slide images with optimized batching.
 * Returns an array of slide objects with image URLs.
 *
 * Processes slides in batches (default concurrency=2) with minimal delays
 * to optimize for OpenAI's higher rate limits (5-250 IPM depending on tier).
 *
 * @param slides - Array of slides with prompts
 * @param slideDeckId - ID for organizing uploaded images in storage
 * @param concurrency - Number of slides to process in parallel (default: 2)
 * @returns Promise<Slide[]> - Slides with imageUrl populated
 * @throws Error if any batch fails after retries
 */
```

- [ ] **Step 4: Check CLAUDE.md for ZhipuAI references**

Run: `grep -n -i zhipuai CLAUDE.md`

If found, update the reference to mention OpenAI instead.

- [ ] **Step 5: Commit documentation updates**

```bash
git add convex/_agents/slides/services/SlideImageGenerationService.ts CLAUDE.md
git commit -m "docs: update comments to reflect OpenAI gpt-image-1.5 usage"
```

---

## Task 10: Manual Testing and Verification

**Files:**

- Test: Full slide generation flow

**Context:** Manually test the changes to ensure they work correctly.

- [ ] **Step 1: Start Convex dev server**

Run: `bun x convex dev`

Expected: Server starts, shows "Convex haul ready" or similar

- [ ] **Step 2: Trigger a slide generation**

Use the web UI or run a Convex function to generate a slide deck with 5-10 slides.

Example via CLI:

```bash
bun x convex run internal.studio.slides.job.generateSlideDeck '{"notebookId":"your-notebook-id","documentIds":["doc-id"]}'
```

Replace with actual IDs from your database.

- [ ] **Step 3: Monitor logs**

Watch for:

- "Generating slide X with OpenAI gpt-image-1.5..." messages
- "Slide X generated successfully" messages
- "Processing batch 1: slides 1-2" messages
- No errors about ZhipuAI
- Text quality in generated images

- [ ] **Step 4: Verify output**

Check:

1. Slides generated successfully (check storage URLs)
2. Images are 1536x1024 resolution
3. Text is crisp and readable
4. Generation time is 3-5x faster than before
5. No rate limit errors (or properly handled with backoff)

- [ ] **Step 5: Test error handling**

Try generating without OPENAI_API_KEY set:

- Should see clear error message about missing key
- Should fail gracefully with proper logging

- [ ] **Step 6: Document test results**

Create a note in the project README or a test log file:

```bash
echo "Slide Generation Test Results - $(date)" >> test-results.md
echo "- OpenAI integration: PASS" >> test-results.md
echo "- Text quality: GOOD" >> test-results.md
echo "- Generation speed: 3.5x faster (measured)" >> test-results.md
echo "- Concurrency: Working correctly" >> test-results.md
```

- [ ] **Step 7: Commit test results (optional)**

```bash
git add test-results.md
git commit -m "test: document OpenAI slide generation test results"
```

---

## Task 11: Deploy to Production

**Files:**

- Deploy: All changes

**Context:** Deploy the changes to production Convex deployment.

- [ ] **Step 1: Push environment variables to production**

Run: `bun run convex:env:push:prod`

Expected: OPENAI_API_KEY pushed to production

- [ ] **Step 2: Deploy Convex functions**

Run: `bun x convex deploy`

Expected: Shows deployment URL, functions uploaded successfully

- [ ] **Step 3: Verify production deployment**

Run: `bun x convex logs --prod --tail`

Expected: Logs show Convex is running

- [ ] **Step 4: Test production slide generation**

Trigger a slide generation in production environment (via web UI or API).

Monitor logs for:

- OpenAI API calls
- Successful generations
- No errors

- [ ] **Step 5: Monitor for issues**

Watch for:

1. Rate limit errors (should be handled with backoff)
2. Quality issues (text rendering)
3. Performance improvements
4. Cost changes

- [ ] **Step 6: Tag release (optional)**

If using git tags:

```bash
git tag -a v1.0.0-openai-slides -m "Switch to OpenAI gpt-image-1.5 for slide generation"
git push origin v1.0.0-openai-slides
```

---

## Task 12: Remove ZhipuAI Dependencies (Optional)

**Files:**

- Modify: `package.json`
- Modify: `.env` (if ZHIPU_API_KEY not used elsewhere)

**Context:** Clean up unused dependencies if ZhipuAI is no longer needed anywhere in the project.

- [ ] **Step 1: Check if ZhipuAI is used elsewhere**

Search codebase for ZhipuAI references:

Run: `grep -r "zhipuai" convex/ apps/ --include="*.ts" --include="*.tsx"`

- [ ] **Step 2: If only used in slides, remove dependency**

If step 1 shows no other usage:

Run: `bun remove zhipuai`

- [ ] **Step 3: Remove ZHIPU_API_KEY from .env**

If not used elsewhere:

Edit `.env` and remove or comment out the ZHIPU_API_KEY line.

- [ ] **Step 4: Remove from env.ts (if safe)**

If ZhipuAI is completely removed:

Edit `convex/_lib/env.ts` and remove the ZHIPU_API_KEY line.

- [ ] **Step 5: Commit cleanup**

```bash
git add package.json bun.lockb .env convex/_lib/env.ts
git commit -m "chore: remove unused ZhipuAI dependencies"
```

---

## Verification Checklist

After completing all tasks, verify:

- [ ] OpenAI SDK installed and imported
- [ ] OPENAI_API_KEY configured in .env and pushed to Convex
- [ ] SlideImageGenerationService uses OpenAI client
- [ ] generateSlideImage() calls OpenAI API with gpt-image-1.5
- [ ] Size set to 1536x1024, quality to medium
- [ ] Error handling supports 401, 400, 429, 500
- [ ] Exponential backoff implemented for rate limits
- [ ] generateSlideImages() uses concurrency=2
- [ ] Batch delays reduced to 1 second
- [ ] Service instantiation passes OPENAI_API_KEY
- [ ] TypeScript compiles without errors
- [ ] Documentation updated to reflect OpenAI usage
- [ ] Manual testing shows working slide generation
- [ ] Text quality is good
- [ ] Generation speed improved 3-5x
- [ ] Deployed to production successfully
- [ ] ZhipuAI dependencies removed (if safe)

---

## Expected Outcomes

**Performance:**

- Generation time: ~3-5 seconds per 2 slides (vs 10-12 seconds per slide before)
- Overall: 3-5x faster for multi-slide decks

**Quality:**

- Crisp text rendering at 1536x1024
- No artifacts or distortions
- Maintains vintage academia aesthetic

**Cost:**

- Medium quality reduces cost vs high quality
- Faster generation = less compute overhead
- Estimated 30-50% cost reduction

**Reliability:**

- Graceful rate limit handling with exponential backoff
- Clear error messages for auth and invalid requests
- Higher rate limits (5-250 IPM) reduce throttling
