# SlideDeckGraph - Professional Slide Deck Generation

> **Deprecated:** Slides were removed in favor of **Infographic** generation (Together AI `openai/gpt-image-1.5`). This document is kept for historical reference only.

## Overview

The SlideDeckGraph generates complete, professional presentation slides using a Map-Reduce architecture with ZhipuAI's glm-image model for text rendering.

**Key Innovation**: Leverages glm-image's excellent text rendering capabilities to generate slides with all text (titles, bullet points, labels) baked directly into the images, eliminating the need for frontend text overlay.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        SLIDE DECK GENERATION                        │
│                     (Map-Reduce + Image Generation)                 │
└─────────────────────────────────────────────────────────────────────┘

                              ┌──────────┐
                              │  START   │
                              └────┬─────┘
                                   │
                                   ▼
                        ┌──────────────────┐
                        │  SPLIT CHUNKS    │
                        │                  │
                        │ • Validate input │
                        │ • Pack chunks    │
                        │ • Set up state   │
                        └────┬─────────────┘
                             │
                             ▼
                  ┌──────────────────────┐
                  │    ROUTE TO MAP      │
                  │                      │
                  │ • Calculate slides   │
                  │   per chunk          │
                  │ • Create parallel    │
                  │   Send tasks         │
                  └──┬───────────────────┘
                     │
        ┌────────────┼────────────┐
        ▼            ▼            ▼
   ┌────────┐  ┌────────┐  ┌────────┐
   │  MAP   │  │  MAP   │  │  MAP   │  (Parallel Processing)
   │ CHUNK1 │  │ CHUNK2 │  │ CHUNK3 │
   │        │  │        │  │        │
   │ LLM    │  │ LLM    │  │ LLM    │
   │ Extract│  │ Extract│  │ Extract│
   │ Slide  │  │ Slide  │  │ Slide  │
   │ Concepts│ │ Concepts│ │ Concepts│
   └───┬────┘  └───┬────┘  └───┬────┘
       │           │           │
       └───────────┼───────────┘
                   ▼
            ┌──────────────┐
            │   COLLAPSE   │
            │              │
            │ • Merge all  │
            │   map outputs│
            │ • Deduplicate│
            │   by title   │
            │ • Recursive  │
            │   if needed  │
            └──────┬───────┘
                   │
                   ▼
            ┌──────────────────────┐
            │      REDUCE          │
            │                      │
            │ Stage 1: Heuristic   │
            │   Deduplication      │
            │   (75% similarity)   │
            │                      │
            │ Stage 2: Topic-Based │
            │   Pre-selection      │
            │   (max 30 slides)    │
            │                      │
            │ Stage 3: LLM         │
            │   Selection          │
            │   (narrative arc)    │
            │                      │
            │ Stage 4: Refine      │
            │   with Image Prompts │
            └──────┬───────────────┘
                   │
                   ▼
         ┌──────────────────────┐
         │  GENERATE IMAGES     │
         │                      │
         │ For each slide:      │
         │ ┌──────────────────┐ │
         │ │ ZhipuAI glm-image│ │
         │ │ • Render title   │ │
         │ │ • Render bullets │ │
         │ │ • Render visuals │ │
         │ │ • Apply theme    │ │
         │ └────────┬─────────┘ │
         │          │           │
         │          ▼           │
         │ ┌──────────────────┐ │
         │ │ Upload to        │ │
         │ │ Convex storage   │ │
         │ └──────────────────┘ │
         │                      │
         │ Sequential (30s delay)│
         │ to avoid rate limits │
         └──────┬───────────────┘
                │
                ▼
         ┌──────────────┐
         │     END      │
         │              │
         │ Final slides │
         │ with image   │
         │ URLs         │
         └──────────────┘
```

## Phase Details

### 1. Split Chunks Phase

- **Input**: Document chunks, slide type, deck length, custom prompt
- **Process**: Validates and packs chunks for optimal processing
- **Output**: Prepared state for map phase

### 2. Map Phase (Parallel)

- **Input**: Individual chunks
- **LLM Model**: TogetherAI (structured output)
- **Process**:
  - Extracts slide concepts from each chunk
  - Generates professional titles (8-12 words)
  - Creates 3-5 complete bullet points (detailed_deck) or 1-2 key phrases (presenter_slides)
  - Ensures concepts have visual storytelling potential
- **Output**: Array of `SlideCandidate` objects per chunk

**SlideCandidate Schema**:

```typescript
{
  title: string;           // Compelling, specific title
  content: string;         // Core learning objective
  talkingPoints: string[]; // Complete, actionable points
  sourceSnippet: string;   // Attribution reference
}
```

### 3. Collapse Phase

- **Input**: All map outputs
- **Process**:
  - Merges outputs from parallel map tasks
  - Deduplicates by title (case-insensitive)
  - Recursive collapse if token count exceeds limits
- **Output**: Consolidated candidate list

### 4. Reduce Phase (Multi-Stage Selection)

#### Stage 1: Heuristic Deduplication

- Calculates Jaccard similarity between slide pairs
- Removes duplicates with >75% similarity
- Preserves diverse content

#### Stage 2: Topic-Based Pre-selection

- Groups slides by topic patterns:
  - Introduction/Foundation
  - Concepts/Definitions
  - Processes/Methods
  - Benefits/Justification
  - Examples/Applications
  - Challenges/Problems
  - Future/Trends
  - Conclusion/Summary
- Selects balanced representation (max 30 slides for LLM)

#### Stage 3: LLM Selection

- **LLM Model**: TogetherAI (structured output)
- **Process**: Intelligent narrative arc construction
  - **Hook** (1-2 slides): Why it matters, context
  - **Foundation** (1-2 slides): Prerequisites, definitions
  - **Core Concepts** (3-5 slides): Main ideas
  - **Deep Dive** (1-2 slides): Details, examples
  - **Application** (1-2 slides): How to use, implications
  - **Conclusion** (1 slide): Summary, next steps
- **Fallback**: Heuristic topic-based selection if LLM fails

#### Stage 4: Refine with Image Prompts

- **LLM Model**: TogetherAI (structured output)
- **Process**: Creates detailed glm-image prompts
  - Specifies exact text to render (title, bullets)
  - Defines typography (fonts, sizes, colors)
  - Describes layout composition (percentages, positioning)
  - Details visual elements (diagrams, illustrations)
  - Applies Vintage Academia theme
- **Output**: `Slide` objects with comprehensive prompts

**Slide Schema**:

```typescript
{
  slideNumber: number;
  title: string;
  prompt: string;          // Detailed glm-image prompt
  imageUrl: string | null; // Filled after generation
  talkingPoints: string[]; // For presenter reference
  sourceReferences: string[];
  metadata: Record<string, string>;
}
```

### 5. Generate Images Phase

#### Image Generation (ZhipuAI glm-image)

- **Model**: `glm-image`
- **Resolution**: 1728x960px (16:9 aspect ratio)
- **Text Rendering**: glm-image excels at rendering text
  - Titles: 60-72pt serif fonts
  - Bullets: 28pt sans-serif fonts
  - Perfect spelling and legibility
- **Visual Style**: Vintage Academia
  - Textured parchment backgrounds (#F5F5DC)
  - Coffee brown text (#4B3621)
  - Hand-drawn ink illustrations
  - Warm, academic aesthetic
- **Rate Limiting**:
  - Sequential processing (concurrency=1)
  - 30-second delays between requests
  - 1 retry on failure

#### Upload to Convex storage

- **Path**: `{slideDeckId}/slide-{number}-{timestamp}.png` (or equivalent)
- **Access**: Convex storage URLs for frontend display

## Slide Types

### Detailed Deck

- **Layout**: 40% text, 60% visual
- **Content**:
  - Large title (60pt serif)
  - 3-5 bullet points (28pt sans-serif)
  - Supporting diagram or illustration
- **Use Case**: Educational presentations, training materials

### Presenter Slides

- **Layout**: 10% text, 90% visual
- **Content**:
  - Bold title (72pt serif)
  - 1-2 key phrases (36pt sans-serif)
  - Dominant visual element
- **Use Case**: Conference talks, keynotes

## Deck Lengths

### Short Deck

- **Range**: 4-6 slides
- **Focus**: Big idea + 3 key pillars
- **Narrative**: Hook → Core Concepts → Impact

### Standard Deck

- **Range**: 8-12 slides
- **Focus**: Complete narrative arc
- **Narrative**: Hook → Foundation → Core → Deep Dive → Application → Conclusion

## Theme: Vintage Academia

### Visual Aesthetic

- **Style**: Leonardo da Vinci's notebooks meets modern coffee shop
- **Backgrounds**: Textured parchment, warm beige, latte tones
- **Typography**:
  - Headers: Classical serif (Playfair Display, Garamond)
  - Body: Clean sans-serif
- **Graphics**: Hand-drawn ink illustrations, sepia diagrams
- **Colors**:
  - Primary: Coffee brown (#4B3621)
  - Background: Beige (#F5F5DC)
  - Accents: Forest green, burnt orange, maroon
- **Vibe**: Intellectual, organic, artisanal, researched

## Quality Assurance

### Content Quality

- ✓ One concept per slide (cognitive load theory)
- ✓ Logical flow between slides (scaffolding)
- ✓ Specific, actionable bullet points (no fragments)
- ✓ Visual storytelling potential
- ✓ Professional tone and language

### Technical Quality

- ✓ Perfect text rendering (no spelling errors)
- ✓ Consistent typography and spacing
- ✓ High resolution (8k quality)
- ✓ Proper aspect ratio (16:9)
- ✓ Theme consistency across all slides

### Narrative Quality

- ✓ Clear opening hook
- ✓ Progressive knowledge building
- ✓ Balanced depth across topics
- ✓ Memorable conclusion
- ✓ Audience engagement throughout

## Error Handling

### Image Generation Failures

- **Retry**: 1 attempt with exponential backoff
- **Fallback**: Placeholder image URL
- **Logging**: Detailed error tracking
- **Continuation**: Process remaining slides

### LLM Failures

- **Map Phase**: Skip failed chunks, continue with others
- **Selection Phase**: Fall back to heuristic selection
- **Refine Phase**: Use template-based fallback prompts

### Rate Limiting

- **Detection**: Monitor ZhipuAI API responses
- **Mitigation**: 30-second delays between requests
- **Graceful Degradation**: Complete what's possible

## Performance Characteristics

### Processing Time

- **Map Phase**: ~30-60 seconds (parallel)
- **Collapse/Reduce**: ~20-40 seconds
- **Image Generation**: ~2-5 minutes per slide (sequential)
- **Total**: 10-30 minutes for standard deck

### Resource Usage

- **Memory**: Cleared after each phase
- **Tokens**: ~50k-100k total (LLM calls)
- **Storage**: ~1-5 MB per slide (images)

### Scalability

- **Chunks**: Handles 10-1000+ chunks via map-reduce
- **Slides**: Optimized for 4-12 final slides
- **Concurrency**: Map phase fully parallel

## Configuration

### Environment Variables

```bash
# LLM Configuration
TOGETHER_AI_API_KEY=xxx
FAST_LLM=meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo

# Image Generation
ZHIPUAI_API_KEY=xxx

# Storage: Convex (configured via Convex dashboard / env)

# Tuning (optional)
SLIDES_MAP_CHUNK_TOKENS=3000
SLIDES_REDUCE_CHUNK_TOKENS=12000
SLIDES_MIN_SLIDES_PER_CHUNK=1
SLIDES_MAX_SLIDES_PER_CHUNK=6
SLIDES_MAX_TOKENS=8000
SLIDES_MAP_TIMEOUT_MS=180000
SLIDES_REDUCE_TIMEOUT_MS=240000
SLIDES_IMAGE_TIMEOUT_MS=60000
```

## Example Workflow

### Input

```typescript
{
  documentIds: ['doc-123', 'doc-456'],
  slideType: 'detailed_deck',
  deckLength: 'default',
  customPrompt: 'Focus on practical applications'
}
```

### Output

```typescript
{
  slides: [
    {
      slideNumber: 1,
      title: "How Machine Learning Transforms Data Analysis",
      prompt: "Professional presentation slide in vintage academia aesthetic...",
      imageUrl: "<Convex storage URL>",
      talkingPoints: [
        "Traditional analysis requires manual pattern recognition",
        "ML algorithms automatically discover insights from data",
        "Applications span healthcare, finance, and research"
      ],
      sourceReferences: ["..."],
      metadata: {}
    },
    // ... 7-11 more slides
  ],
  metadata: {
    documentIds: ['doc-123', 'doc-456'],
    chunksProcessed: 45,
    slideType: 'detailed_deck',
    deckLength: 'default',
    customPrompt: 'Focus on practical applications'
  }
}
```

## Future Enhancements

### Potential Improvements

- [ ] Custom theme support (beyond Vintage Academia)
- [ ] Interactive elements (animations, transitions)
- [ ] Multi-language support
- [ ] Speaker notes generation with timing
- [ ] Export to PowerPoint/PDF
- [ ] Real-time preview during generation
- [ ] A/B testing of different visual styles
- [ ] Accessibility features (alt text, high contrast)

### Advanced Features

- [ ] Video slide generation
- [ ] Audio narration synthesis
- [ ] Collaborative editing
- [ ] Template library
- [ ] Brand guideline enforcement
- [ ] Analytics on slide effectiveness
