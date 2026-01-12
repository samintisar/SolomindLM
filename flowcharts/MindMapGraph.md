# MindMapGraph Agent Flowchart

This flowchart visualizes the execution flow of the MindMapGraph agent, which generates hierarchical mind maps from educational content through a map-reduce pattern with structured concept extraction.

## Flow Diagram

```mermaid
flowchart TD
    START([Start]) --> CreateMapTasks[createMapTasks<br/>Fan-Out Logic]
    
    CreateMapTasks --> ValidateChunks[Validate & Pack Chunks<br/>Target: 15K chars/chunk]
    
    ValidateChunks --> CheckChunks{Valid<br/>Chunks?}
    
    CheckChunks -->|No Valid Chunks| Error[Throw Error<br/>No Valid Chunks]
    CheckChunks -->|Has Chunks| FanOut[Create Send Objects<br/>for Parallel Processing]
    
    FanOut --> MapProcess1[map_process<br/>Chunk 1<br/>Fast LLM + Structured Output]
    FanOut --> MapProcess2[map_process<br/>Chunk 2<br/>Fast LLM + Structured Output]
    FanOut --> MapProcessN[map_process<br/>Chunk N<br/>Fast LLM + Structured Output]
    
    MapProcess1 --> AddJitter1[Add Jitter<br/>Prevent Synchronized Starts]
    MapProcess2 --> AddJitter2[Add Jitter<br/>Prevent Synchronized Starts]
    MapProcessN --> AddJitterN[Add Jitter<br/>Prevent Synchronized Starts]
    
    AddJitter1 --> ExtractConcepts1[extractConcepts<br/>Structured Output<br/>Zod Schema Validation]
    AddJitter2 --> ExtractConcepts2[extractConcepts<br/>Structured Output<br/>Zod Schema Validation]
    AddJitterN --> ExtractConceptsN[extractConcepts<br/>Structured Output<br/>Zod Schema Validation]
    
    ExtractConcepts1 --> CheckSuccess1{Extraction<br/>Successful?}
    ExtractConcepts2 --> CheckSuccess2{Extraction<br/>Successful?}
    ExtractConceptsN --> CheckSuccessN{Extraction<br/>Successful?}
    
    CheckSuccess1 -->|Success| Deduplicate1[Return Concepts<br/>Deduplication in Reducer]
    CheckSuccess1 -->|Error| CheckRetry1{Retryable<br/>Error?}
    CheckSuccess2 -->|Success| Deduplicate2[Return Concepts<br/>Deduplication in Reducer]
    CheckSuccess2 -->|Error| CheckRetry2{Retryable<br/>Error?}
    CheckSuccessN -->|Success| DeduplicateN[Return Concepts<br/>Deduplication in Reducer]
    CheckSuccessN -->|Error| CheckRetryN{Retryable<br/>Error?}
    
    CheckRetry1 -->|Timeout/Server Error<br/>Retry Count < 3| Retry1[Retry with Backoff<br/>Exponential + Jitter<br/>Send to map_process]
    CheckRetry1 -->|Client Error<br/>or Max Retries| CheckCircuitBreaker1{Circuit<br/>Breaker<br/>Tripped?}
    CheckRetry2 -->|Timeout/Server Error<br/>Retry Count < 3| Retry2[Retry with Backoff<br/>Exponential + Jitter<br/>Send to map_process]
    CheckRetry2 -->|Client Error<br/>or Max Retries| CheckCircuitBreaker2{Circuit<br/>Breaker<br/>Tripped?}
    CheckRetryN -->|Timeout/Server Error<br/>Retry Count < 3| RetryN[Retry with Backoff<br/>Exponential + Jitter<br/>Send to map_process]
    CheckRetryN -->|Client Error<br/>or Max Retries| CheckCircuitBreakerN{Circuit<br/>Breaker<br/>Tripped?}
    
    Retry1 --> ExtractConcepts1
    Retry2 --> ExtractConcepts2
    RetryN --> ExtractConceptsN
    
    CheckCircuitBreaker1 -->|Failures >= 5| CircuitBreakerTrip[Circuit Breaker Tripped<br/>Stop Generation<br/>Throw Error]
    CheckCircuitBreaker1 -->|Failures < 5| ReturnEmpty1[Return Empty Concepts<br/>Continue Processing]
    CheckCircuitBreaker2 -->|Failures >= 5| CircuitBreakerTrip
    CheckCircuitBreaker2 -->|Failures < 5| ReturnEmpty2[Return Empty Concepts<br/>Continue Processing]
    CheckCircuitBreakerN -->|Failures >= 5| CircuitBreakerTrip
    CheckCircuitBreakerN -->|Failures < 5| ReturnEmptyN[Return Empty Concepts<br/>Continue Processing]
    
    Deduplicate1 --> AggregateConcepts[LangGraph Automatic Fan-In<br/>Aggregate via Reducer<br/>Deduplicate by Theme+Summary]
    Deduplicate2 --> AggregateConcepts
    DeduplicateN --> AggregateConcepts
    ReturnEmpty1 --> AggregateConcepts
    ReturnEmpty2 --> AggregateConcepts
    ReturnEmptyN --> AggregateConcepts
    
    AggregateConcepts --> ReduceNode[reduce_node<br/>Mind Map Synthesis]
    
    ReduceNode --> CheckExtractions{Extractions<br/>Available?}
    
    CheckExtractions -->|No Extractions| ReturnError[Return Error State<br/>No Content Extracted]
    CheckExtractions -->|Has Extractions| PrepareInput[Prepare Input Data<br/>Format: Theme, Summary, Concepts<br/>Truncate to 150K chars]
    
    PrepareInput --> GenerateMarkdown[Generate Mind Map<br/>Smart LLM<br/>Markdown Format]
    
    GenerateMarkdown --> CheckGeneration{Generation<br/>Successful?}
    
    CheckGeneration -->|Success| ValidateMarkdown[Validate Mind Map<br/>Check Structure<br/>Check for Generic Labels]
    CheckGeneration -->|Error| SmartFallback[createSmartFallback<br/>Build Tree from Extractions]
    
    ValidateMarkdown --> ParseMarkdown[parseMarkdownToTree<br/>Parse Markdown to JSON Tree]
    
    ParseMarkdown --> CleanTree[cleanLeafNodes<br/>Convert Empty Arrays to Null]
    
    CleanTree --> ReturnSuccess[Return Final Mind Map<br/>Status: completed]
    
    SmartFallback --> FindRootTheme[Find Most Common Theme<br/>for Root Title]
    
    FindRootTheme --> GroupByTheme[Group Concepts by Theme<br/>Build Tree Structure]
    
    GroupByTheme --> ReturnFallback[Return Fallback Mind Map<br/>Status: completed]
    
    Error --> END([End])
    CircuitBreakerTrip --> END
    ReturnError --> END
    ReturnSuccess --> END
    ReturnFallback --> END
    
    %% Styling
    classDef startEnd fill:#e1f5e1,stroke:#4caf50,stroke-width:2px
    classDef process fill:#e3f2fd,stroke:#2196f3,stroke-width:2px
    classDef decision fill:#fff3e0,stroke:#ff9800,stroke-width:2px
    classDef parallel fill:#f3e5f5,stroke:#9c27b0,stroke-width:2px
    classDef error fill:#ffebee,stroke:#f44336,stroke-width:2px
    classDef structured fill:#e8f5e9,stroke:#66bb6a,stroke-width:2px
    classDef circuit fill:#fff9c4,stroke:#fbc02d,stroke-width:2px
    
    class START,END startEnd
    class CreateMapTasks,ValidateChunks,FanOut,AddJitter1,AddJitter2,AddJitterN,PrepareInput,GenerateMarkdown,ValidateMarkdown,ParseMarkdown,CleanTree,FindRootTheme,GroupByTheme process
    class CheckChunks,CheckSuccess1,CheckSuccess2,CheckSuccessN,CheckRetry1,CheckRetry2,CheckRetryN,CheckExtractions,CheckGeneration decision
    class MapProcess1,MapProcess2,MapProcessN,ExtractConcepts1,ExtractConcepts2,ExtractConceptsN,Deduplicate1,Deduplicate2,DeduplicateN,AggregateConcepts parallel
    class Error,CircuitBreakerTrip,ReturnError,ReturnEmpty1,ReturnEmpty2,ReturnEmptyN error
    class ExtractConcepts1,ExtractConcepts2,ExtractConceptsN structured
    class CheckCircuitBreaker1,CheckCircuitBreaker2,CheckCircuitBreakerN circuit
```

## Key Components

### 1. **Fan-Out Logic** (`createMapTasks`)
- Validates and packs chunks (target: 15K chars/chunk)
- Creates Send objects for parallel processing
- Returns error if no valid chunks after validation

### 2. **Map Phase** (`mapProcess`) - Parallel Execution
- Processes each chunk independently using Fast LLM
- **Jitter Addition**: Prevents synchronized starts
  - First attempt: Random 0-500ms jitter
  - Retries: Exponential backoff + jitter
- **Structured Output** with Zod schema validation:
  - `ConceptExtractionSchema`: Validates extraction structure
  - Extracts: main_theme, summary, key_concepts (15 concepts)
- **Error Handling**:
  - Retries on timeout/server errors (500, 503)
  - Max 3 attempts per chunk
  - Exponential backoff with jitter
  - Fails fast on client errors
- **Circuit Breaker**:
  - Tracks total permanent failures across all chunks
  - Trips after 5 failures
  - Stops entire generation to prevent cascading failures
- Returns extracted concepts (or empty array on permanent failure)

### 3. **Automatic Fan-In** (LangGraph Reducer)
- LangGraph automatically waits for all map nodes to complete
- Aggregates results via reducer
- **Deduplication**:
  - Uses theme + summary as unique key
  - Filters duplicate extractions
  - Logs skipped duplicates

### 4. **Reduce Phase** (`reduceNode`)
- Synthesizes mind map from extracted concepts
- **Input Preparation**:
  - Formats extractions as: "THEME: ... SUMMARY: ... CONCEPTS: ..."
  - Truncates to 150K chars for safety
- **Markdown Generation**:
  - Uses Smart LLM to generate hierarchical markdown
  - Format: # Root, * branches, indented sub-topics
  - Validates output structure
- **Markdown Parsing**:
  - Parses markdown to JSON tree structure
  - Supports: # headers, *, -, numbered bullets
  - Handles 2-space or 4-space indentation
  - Converts empty children arrays to null
- **Smart Fallback** (if LLM fails):
  - Finds most common theme for root title
  - Groups concepts by theme
  - Builds tree structure without generic labels
  - Avoids "Aspect" or "Category" buckets

## State Management

The agent uses two state types:

### `OverallState`
- `allChunks`: Input document chunks
- `extractedConcepts`: Array of concept extractions (with deduplication reducer)
- `finalOutput`: Final mind map tree structure
- `status`: Current processing status
- `progress`: Progress tracking for streaming

### `ChunkState` (for map processing)
- `content`: Chunk content to process
- `retryCount`: Current retry attempt
- `chunkIndex`: Index of chunk (for progress tracking)
- `totalChunks`: Total number of chunks

## Concept Extraction Schema

Each extraction follows the `ConceptExtraction` interface:
```typescript
{
  main_theme: string;      // Single sentence (max 15 words)
  summary: string;         // 2-3 sentences (50-100 words)
  key_concepts: string[];  // Exactly 15 distinct concepts
}
```

## Mind Map Structure

The final output is a hierarchical tree:
```typescript
{
  nodeData: {
    topic: string;           // Node topic
    children: MindMapNode[] | null;  // Child nodes or null for leaves
  }
}
```

### Markdown Format Requirements
- **Level 0 (Root)**: `# Single overarching topic`
- **Level 1**: `* Main branches` (2-space indent, 4-7 branches)
- **Level 2**: `  * Sub-topics` (4-space indent, 3-5 per branch)
- **Level 3-4**: `    * Granular concepts` (6-8 space indent)

## Key Features

### Structured Output
- Uses Zod schemas for reliable concept extraction
- Ensures consistent format across all extractions
- Validates at extraction time

### Deduplication
- Uses theme + summary as unique key
- Prevents duplicate extractions from different chunks
- Logs skipped duplicates for visibility

### Circuit Breaker Pattern
- Prevents cascading failures
- Tracks total failures across all chunks
- Stops generation after 5 permanent failures
- Resets on successful extraction

### Retry Logic
- Exponential backoff with jitter
- Retries only on timeout/server errors (500, 503)
- Fails fast on client errors
- Max 3 attempts per chunk

### Jitter Strategy
- Prevents thundering herd problem
- Random delay on first attempt (0-500ms)
- Exponential backoff + jitter on retries
- Reduces synchronized load spikes

### Grounding Requirements
- **Map Phase**: Only extracts concepts explicitly stated in content
- **Reduce Phase**: Only uses concepts from extracted data
- No generic labels like "Overview", "Introduction", "Conclusion"
- Each terminal node must be a specific concept from source

### Smart Fallback
- Creates meaningful tree if LLM fails
- Uses most common theme for root
- Groups concepts by theme
- Avoids generic category labels
- Ensures generation always completes

### Markdown Parsing
- Robust parser supporting multiple formats
- Handles # headers, *, -, numbered bullets
- Normalizes tabs to spaces
- Calculates indentation levels
- Builds proper tree structure
- Cleans empty children arrays

## Error Handling

### Map Phase Errors
- **Timeout Errors**: Retry with backoff
- **Server Errors (500, 503)**: Retry with backoff
- **Client Errors**: Fail fast, no retry
- **Circuit Breaker**: Stop after 5 failures

### Reduce Phase Errors
- **LLM Failure**: Use smart fallback
- **No Extractions**: Return error state
- **Validation Issues**: Log warnings, continue

## Performance Optimizations

- **Parallel Processing**: Map phase processes chunks concurrently
- **No Collapse Phase**: Simpler than ReportGraph (direct aggregation)
- **Structured Output**: Reduces parsing errors
- **Jitter**: Prevents synchronized load spikes
- **Circuit Breaker**: Prevents resource waste on failures
- **Input Truncation**: Limits reduce phase input to 150K chars

## Validation

The mind map output is validated for:
- **Structure**: Minimum 4 levels deep (if supported by content)
- **Generic Labels**: No "Overview", "Introduction", "Conclusion", "Aspect", "Category"
- **Terminal Nodes**: Must be specific concepts, not categories
- **Format**: Proper markdown hierarchy

## Differences from Other Agents

### vs ReportGraph
- **Simpler**: No collapse phase, direct aggregation
- **Structured Output**: Uses Zod schemas for extraction
- **Different Output**: Tree structure vs text report

### vs QuizGraph
- **No Question Selection**: Direct aggregation of concepts
- **Tree Structure**: Hierarchical mind map vs flat question array
- **Markdown Parsing**: Converts markdown to JSON tree
