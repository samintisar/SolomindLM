# ReportGraph Agent Flowchart

This flowchart visualizes the execution flow of the ReportGraph agent, which processes documents through a map-reduce pattern to generate various types of reports.

## Flow Diagram

```mermaid
flowchart TD
    START([Start]) --> ValidateInput[validate_input<br/>Validate Input State]
    
    ValidateInput --> CheckValidation{Validation<br/>Result}
    
    CheckValidation -->|Error| MergeResults1[merge_results<br/>Return Error State]
    CheckValidation -->|Valid| RouteToMap[routeToMap<br/>Route to Map Phase]
    
    RouteToMap --> CheckChunks{Chunks<br/>Available?}
    
    CheckChunks -->|No Chunks| Collapse1[collapse<br/>Skip to Collapse]
    CheckChunks -->|Has Chunks| PackChunks[Pack & Validate Chunks<br/>Target: 20K chars/chunk]
    
    PackChunks --> FanOut[Fan-Out: Create Send Objects<br/>for Parallel Processing]
    
    FanOut --> MapProcess1[map_process<br/>Chunk 1<br/>Fast LLM]
    FanOut --> MapProcess2[map_process<br/>Chunk 2<br/>Fast LLM]
    FanOut --> MapProcessN[map_process<br/>Chunk N<br/>Fast LLM]
    
    MapProcess1 --> ExtractTopics1[Extract Topics<br/>from Output]
    MapProcess2 --> ExtractTopics2[Extract Topics<br/>from Output]
    MapProcessN --> ExtractTopicsN[Extract Topics<br/>from Output]
    
    ExtractTopics1 --> CollectMapOutputs[Collect All Map Outputs<br/>Reducer Concatenates]
    ExtractTopics2 --> CollectMapOutputs
    ExtractTopicsN --> CollectMapOutputs
    
    CollectMapOutputs --> Collapse2[collapse<br/>Recursive Collapse Phase]
    Collapse1 --> Collapse2
    
    Collapse2 --> AnalyzeTopics[Analyze Topic Distribution<br/>Group by Topics]
    
    AnalyzeTopics --> CheckCollapseSize{Need<br/>Recursive<br/>Collapse?}
    
    CheckCollapseSize -->|>3 summaries| RecursiveCollapse[recursiveCollapse<br/>Group into ~4 summaries<br/>Collapse in Parallel]
    CheckCollapseSize -->|≤3 summaries| Reduce[reduce<br/>Final Synthesis]
    
    RecursiveCollapse --> CollapseGroup1[collapseGroup<br/>Group 1<br/>Smart LLM]
    RecursiveCollapse --> CollapseGroup2[collapseGroup<br/>Group 2<br/>Smart LLM]
    RecursiveCollapse --> CollapseGroupM[collapseGroup<br/>Group M<br/>Smart LLM]
    
    CollapseGroup1 --> CheckCollapseSize
    CollapseGroup2 --> CheckCollapseSize
    CollapseGroupM --> CheckCollapseSize
    
    Reduce --> InjectTopics[Inject Topic Requirements<br/>into Reduce Prompt]
    
    InjectTopics --> GenerateReport[Generate Final Report<br/>Smart LLM<br/>Report Type Specific]
    
    GenerateReport --> ValidateCompleteness{Report<br/>Complete?}
    
    ValidateCompleteness -->|Truncated| AddWarning[Add Truncation Warning]
    ValidateCompleteness -->|Complete| MergeResults2[merge_results<br/>Final State]
    AddWarning --> MergeResults2
    
    MergeResults1 --> END([End])
    MergeResults2 --> END
    
    %% Styling
    classDef startEnd fill:#e1f5e1,stroke:#4caf50,stroke-width:2px
    classDef process fill:#e3f2fd,stroke:#2196f3,stroke-width:2px
    classDef decision fill:#fff3e0,stroke:#ff9800,stroke-width:2px
    classDef parallel fill:#f3e5f5,stroke:#9c27b0,stroke-width:2px
    classDef error fill:#ffebee,stroke:#f44336,stroke-width:2px
    
    class START,END startEnd
    class ValidateInput,RouteToMap,PackChunks,Collapse2,AnalyzeTopics,RecursiveCollapse,Reduce,InjectTopics,GenerateReport,MergeResults2 process
    class CheckValidation,CheckChunks,CheckCollapseSize,ValidateCompleteness decision
    class MapProcess1,MapProcess2,MapProcessN,ExtractTopics1,ExtractTopics2,ExtractTopicsN,CollectMapOutputs,CollapseGroup1,CollapseGroup2,CollapseGroupM parallel
    class MergeResults1,AddWarning error
```

## Key Components

### 1. **Input Validation** (`validate_input`)
- Validates chunks, report type, and custom prompts
- Returns error state if validation fails

### 2. **Routing** (`routeToMap`)
- Checks if chunks are available
- Packs and validates chunks (target: 20K chars/chunk)
- Creates Send objects for parallel processing or routes to collapse

### 3. **Map Phase** (`map_process`) - Parallel Execution
- Processes each chunk independently using Fast LLM
- Extracts topics, insights, and structured content
- Report type determines the extraction format:
  - `briefing`: Insights, themes, evidence, action items
  - `study_guide`: Learning objectives, concepts, quiz questions
  - `blog_post`: Takeaways, quotes, actionable advice
  - `summary`: Arguments, evidence, conclusions
  - `technical_report`: Specifications, methodologies, metrics
  - `concept_explainer`: Concepts, relationships, examples
  - `methodology_overview`: Methods, frameworks, data collection
  - `custom`: User-defined prompt

### 4. **Collapse Phase** (`collapse`)
- Recursively collapses map outputs if >3 summaries
- Groups summaries (~4 per group) and collapses in parallel
- Preserves structured format with "Main Topics:" sections
- Uses Smart LLM for quality synthesis

### 5. **Reduce Phase** (`reduce`)
- Final synthesis of collapsed outputs
- Injects explicit topic coverage requirements
- Generates report type-specific output
- Validates completeness and detects truncation
- Uses Smart LLM with higher token limits

### 6. **Merge Results** (`merge_results`)
- Final state update
- Marks status as 'completed'
- Returns final output

## State Management

The agent uses `OverallState` with the following key fields:
- `chunks`: Input document chunks
- `reportType`: Type of report to generate
- `customPrompt`: Optional custom prompt
- `mapOutputs`: Results from parallel map processing
- `collapsedOutputs`: Synthesized outputs from collapse phase
- `finalOutput`: Final generated report
- `status`: Current processing status
- `progress`: Progress tracking for streaming

## Error Handling

- **Timeout Protection**: Each phase has timeout limits (Map: 200s, Reduce: 300s)
- **Retry Logic**: Exponential backoff retry for transient failures
- **Fallback Outputs**: Error chunks return fallback content to continue processing
- **Truncation Detection**: Validates report completeness and warns if truncated

## Performance Optimizations

- **Parallel Processing**: Map phase processes chunks concurrently
- **Recursive Collapse**: Efficiently handles large numbers of map outputs
- **Topic Caching**: Caches extracted topics for performance
- **Dynamic Grouping**: Optimizes collapse group sizes based on content

## Report Types Supported

1. **briefing**: Executive summaries with themes and recommendations
2. **study_guide**: Learning materials with quizzes and glossaries
3. **blog_post**: Engaging listicles with takeaways
4. **summary**: Concise information synthesis
5. **technical_report**: Detailed technical documentation
6. **concept_explainer**: Accessible concept explanations
7. **methodology_overview**: Research method documentation
8. **custom**: User-defined report format
