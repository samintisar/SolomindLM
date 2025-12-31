import { StateGraph, START, END, Send, Annotation } from '@langchain/langgraph';
import { ChatTogetherAI } from '@langchain/community/chat_models/togetherai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { env } from '../../config/env.js';

// Configuration constants - now with env variable support
const GRAPH_CONFIG = {
  MAP_CHUNK_SIZE: parseInt(env.REPORT_MAP_CHUNK_SIZE || '20000', 10), // Reduced from 30K for faster, more reliable processing
  REDUCE_CHUNK_SIZE: parseInt(env.REPORT_REDUCE_CHUNK_SIZE || '60000', 10),
  MAP_TIMEOUT_MS: 180000, // Increased from 120s to 180s for large chunks
  REDUCE_TIMEOUT_MS: 300000, // Increased from 180s to 300s for synthesis
} as const;

// State definitions using the newer Annotation API
export const OverallState = Annotation.Root({
  documentIds: Annotation<string[]>({
    reducer: (_x: string[], y?: string[]) => y ?? _x,
    default: () => [],
  }),
  chunks: Annotation<string[]>({
    reducer: (_x: string[], y?: string[]) => y ?? _x,
    default: () => [],
  }),
  reportType: Annotation<string>({
    reducer: (_x: string, y?: string) => y ?? _x,
    default: () => '',
  }),
  customPrompt: Annotation<string | undefined>({
    reducer: (_x: string | undefined, y?: string | undefined) => y ?? _x,
    default: () => undefined,
  }),
  mapOutputs: Annotation<string[]>({
    reducer: (x: string[], y?: string[]) => y ? x.concat(y) : x,
    default: () => [],
  }),
  collapsedOutputs: Annotation<string[]>({
    reducer: (_x: string[], y?: string[]) => y ?? _x,
    default: () => [],
  }),
  finalOutput: Annotation<string>({
    reducer: (_x: string, y?: string) => y ?? _x,
    default: () => '',
  }),
  status: Annotation<string>({
    reducer: (_x: string, y?: string) => y ?? _x,
    default: () => 'generating',
  }),
});

export type OverallStateType = typeof OverallState.State;

// Minimal state for parallel map processing - only what each chunk needs
export interface ChunkProcessState {
  chunk: string;
  chunkIndex?: number; // Track which chunk this is for debugging
  reportType: string;
  customPrompt?: string;
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

export function packChunks(chunks: string[], targetSize: number = GRAPH_CONFIG.MAP_CHUNK_SIZE): string[] {
  if (!chunks || chunks.length === 0) return [];

  console.log(`\n[ReportGraph] ===== CHUNK PACKING =====`);
  console.log(`[ReportGraph] Original chunks: ${chunks.length}`);
  console.log(`[ReportGraph] Target size: ${targetSize} chars per packed chunk`);

  const packed: string[] = [];
  const buffer: string[] = [];
  let bufferSize = 0;

  for (const chunk of chunks) {
    if (!chunk?.trim()) continue;
    const chunkSize = chunk.length + (buffer.length > 0 ? 2 : 0);

    if (bufferSize + chunkSize > targetSize && buffer.length > 0) {
      packed.push(buffer.join('\n\n'));
      buffer.length = 0;
      bufferSize = 0;
    }

    buffer.push(chunk);
    bufferSize += chunkSize;
  }

  if (buffer.length > 0) {
    packed.push(buffer.join('\n\n'));
  }

  const reduction = Math.round((1 - packed.length / chunks.length) * 100);
  console.log(`[ReportGraph] Packed into: ${packed.length} chunks (${reduction}% fewer API calls)`);

  return packed;
}

export function validateChunks(chunks: string[]): string[] {
  if (!chunks || chunks.length === 0) return [];

  console.log(`\n[ReportGraph] ===== INPUT VALIDATION =====`);
  console.log(`[ReportGraph] Input chunks: ${chunks.length}`);

  const validated = chunks
    .filter(c => c && typeof c === 'string')
    .map(c => c.slice(0, 50000))
    .filter(c => c.trim().length > 50);

  console.log(`[ReportGraph] Valid chunks: ${validated.length}`);
  console.log(`[ReportGraph] Filtered out: ${chunks.length - validated.length} (too short or invalid)`);

  return validated;
}

// Map prompts for each report type
const MAP_PROMPTS: Record<string, string> = {
  briefing: `Extract key insights, main themes, evidence, and action items from this section:

{chunk}

Format your response as:
- Main Topics: [list 3-5 key topics this section covers]
- Key Insights: [bulleted list of critical takeaways]
- Main Themes: [core topics and patterns]
- Supporting Evidence: [data, quotes, or examples that back up claims]
- Action Items: [specific next steps or recommendations]

INSIGHTS:`,

  study_guide: `Extract learning content from this section:

{chunk}

Format your response as:
- Main Topics: [list 3-5 key topics this section covers]
- Learning Objectives: [what students should understand]
- Key Concepts: [definitions with explanations]
- Important Terms: [vocabulary words with brief definitions]
- Potential Quiz Questions: [short-answer questions based on this section]

CONCEPTS:`,

  blog_post: `Extract engaging content for a blog post from this section:

{chunk}

Format your response as:
- Main Topics: [list 3-5 key topics this section covers]
- Surprising Takeaways: [counter-intuitive or unexpected points]
- Impactful Insights: [ideas that would resonate with readers]
- Notable Quotes: [powerful quotes worth featuring]
- Actionable Advice: [practical tips readers can apply]

CONTENT:`,

  summary: `Extract the essential information from this section:

{chunk}

Format your response as:
- Main Topics: [list 3-5 key topics this section covers]
- Main Arguments: [core claims and positions]
- Key Evidence: [supporting data and examples]
- Important Conclusions: [significant findings or outcomes]
- Context: [relevant background information]

SUMMARY:`,

  technical_report: `Extract technical details from this section:

{chunk}

Format your response as:
- Main Topics: [list 3-5 key topics this section covers]
- Technical Specifications: [specific parameters, configurations, or requirements]
- Methodologies: [approaches, algorithms, or frameworks used]
- Data and Metrics: [quantitative information and measurements]
- Findings: [technical conclusions and observations]

TECHNICAL:`,

  concept_explainer: `Identify concepts and relationships from this section:

{chunk}

Format your response as:
- Main Topics: [list 3-5 key topics this section covers]
- Core Concepts: [main ideas and definitions]
- Relationships: [how concepts connect to each other]
- Examples: [illustrative instances or analogies]
- Common Misconceptions: [potential misunderstandings to clarify]

CONCEPTS:`,

  methodology_overview: `Extract methodological information from this section:

{chunk}

Format your response as:
- Main Topics: [list 3-5 key topics this section covers]
- Research Methods: [approaches and techniques used]
- Frameworks Applied: [theoretical or practical models]
- Data Collection: [how information was gathered]
- Analysis Approaches: [how data was processed and interpreted]

METHODOLOGY:`,

  custom: `{customPrompt}

{chunk}`,
};

// Reduce prompts for each report type
const REDUCE_PROMPTS: Record<string, string> = {
  briefing: `CRITICAL REQUIREMENT - READ CAREFULLY:
You MUST cover ALL major topics present in the source material.
Do not focus primarily on one or two topics while neglecting others.
Ensure each major theme receives balanced, thorough coverage.
If the sources cover 6+ distinct topics, each should be addressed meaningfully.

Create a comprehensive briefing document that synthesizes the main themes and ideas from the sources. Start with a concise Executive Summary that presents the most critical takeaways upfront. The body of the document must provide a detailed and thorough examination of the main themes, evidence, and conclusions found in the sources. This analysis should be structured logically with headings and bullet points to ensure clarity. The tone must be objective and incisive.

## Executive Summary
[Concise overview of the most critical takeaways]

## Main Themes
[Detailed examination of core themes found in the sources]

## Key Findings and Evidence
[Organized insights with supporting data, quotes, or examples]

## Conclusions
[Significant outcomes and implications]

## Recommendations
[Action items based on findings]

Based on the following source material:

{content}

BRIEFING DOC:`,

  study_guide: `CRITICAL REQUIREMENT - READ CAREFULLY:
You MUST cover ALL major topics present in the source material.
Do not focus primarily on one or two topics while neglecting others.
Ensure each major theme receives balanced, thorough coverage.
If the sources cover 6+ distinct topics, each should be addressed meaningfully.

You are a highly capable research assistant and tutor. Create a detailed study guide designed to review understanding of the sources. Create a quiz with ten short-answer questions (2-3 sentences each) and include a separate answer key. Suggest five essay format questions, but do not supply answers. Also conclude with a comprehensive glossary of key terms with definitions.

## Learning Objectives
[What students should be able to do after studying]

## Study Notes
[Organized summary of main topics and concepts]

## Quiz Questions
[10 short-answer questions (2-3 sentences each)]

## Answer Key
[Answers to the quiz questions]

## Essay Questions
[5 essay prompts for deeper exploration - no answers provided]

## Glossary
[Comprehensive list of key terms with definitions]

Based on the following source material:

{content}

STUDY GUIDE:`,

  blog_post: `CRITICAL REQUIREMENT - READ CAREFULLY:
You MUST cover ALL major topics present in the source material.
Do not focus primarily on one or two topics while neglecting others.
Ensure each major theme receives balanced, thorough coverage.
If the sources cover 6+ distinct topics, each should be addressed meaningfully.

Act as a thoughtful writer and synthesizer of ideas, tasked with creating an engaging and readable blog post for a popular online publishing platform known for its clean aesthetic and insightful content. Your goal is to distill the top most surprising, counter-intuitive, or impactful takeaways from the provided source materials into a compelling listicle. The writing style should be clean, accessible, and highly scannable, employing a conversational yet intelligent tone. Craft a compelling, click-worthy headline. Begin the article with a short introduction that hooks the reader by establishing a relatable problem or curiosity, then present each of the takeaway points as a distinct section with a clear, bolded subheading. Within each section, use short paragraphs to explain the concept clearly, and don't just summarize; offer a brief analysis or a reflection on why this point is so interesting or important, and if a powerful quote exists in the sources, feature it in a blockquote for emphasis. Conclude the post with a brief, forward-looking summary that leaves the reader with a final thought-provoking question or a powerful takeaway to ponder.

## [Compelling, Click-Worthy Headline]

### Introduction
[Hook that establishes a relatable problem or curiosity]

### [First Key Takeaway]
[Clear explanation with analysis and potential blockquote]

### [Second Key Takeaway]
[Clear explanation with analysis and potential blockquote]

### [Third Key Takeaway]
[Clear explanation with analysis and potential blockquote]

### [Additional Key Takeaways as needed]
[Continue with same structure]

### Conclusion
[Forward-looking summary with final thought-provoking question or powerful takeaway]

Based on the following source material:

{content}

BLOG POST:`,

  summary: `CRITICAL REQUIREMENT - READ CAREFULLY:
You MUST cover ALL major topics present in the source material.
Do not focus primarily on one or two topics while neglecting others.
Ensure each major theme receives balanced, thorough coverage.
If the sources cover 6+ distinct topics, each should be addressed meaningfully.

Create a comprehensive yet concise summary that synthesizes the essential information from the sources. Begin with an overview that captures the core subject and purpose. The body should systematically present the main arguments, key evidence supporting those arguments, and important conclusions. Maintain a neutral, objective tone while ensuring all significant points are covered. Use clear headings and bullet points to enhance readability.

## Overview
[Brief introduction to the subject and purpose of the sources]

## Main Arguments
[Core claims and positions presented in the sources]

## Key Evidence
[Supporting data, examples, and evidence]

## Conclusions
[Significant findings, outcomes, and implications]

Based on the following source material:

{content}

SUMMARY:`,

  technical_report: `CRITICAL REQUIREMENT - READ CAREFULLY:
You MUST cover ALL major topics present in the source material.
Do not focus primarily on one or two topics while neglecting others.
Ensure each major theme receives balanced, thorough coverage.
If the sources cover 6+ distinct topics, each should be addressed meaningfully.

Create a detailed technical report that thoroughly documents the technical aspects of the subject matter. Begin with an executive summary of technical findings. The body should include comprehensive sections on technical specifications, methodologies employed, data and metrics analysis, and detailed findings. Use precise technical language and include specific parameters, configurations, and quantitative measurements where applicable. The report should be structured for technical professionals who require in-depth information.

## Executive Summary
[Concise overview of technical findings]

## Technical Specifications
[Detailed parameters, configurations, and requirements]

## Methodologies
[Approaches, algorithms, or frameworks used]

## Data and Metrics
[Quantitative information and measurements]

## Analysis
[Detailed examination of technical data]

## Findings and Conclusions
[Technical conclusions and recommendations]

Based on the following source material:

{content}

TECHNICAL REPORT:`,

  concept_explainer: `CRITICAL REQUIREMENT - READ CAREFULLY:
You MUST cover ALL major topics present in the source material.
Do not focus primarily on one or two topics while neglecting others.
Ensure each major theme receives balanced, thorough coverage.
If the sources cover 6+ distinct topics, each should be addressed meaningfully.

Create an accessible and comprehensive explanation of the core concepts found in the sources. Begin with an introduction that explains why these concepts matter and who they are relevant for. For each concept, provide a clear definition, explain how it relates to other concepts, give concrete examples or analogies to aid understanding, and address common misconceptions. Use clear, jargon-free language that makes complex ideas understandable to a non-expert audience. Organize the content logically with concepts building upon each other.

## Introduction
[Why these concepts matter and who they are for]

## Core Concepts
[For each concept include:]
### [Concept Name]
- **Definition**: [Clear, concise explanation]
- **How It Relates**: [Connections to other concepts]
- **Examples**: [Concrete instances or analogies]
- **Common Misconceptions**: [What people often get wrong]

## Key Relationships
[How concepts interact and connect]

## Summary
[Quick reference of the most important points]

Based on the following source material:

{content}

CONCEPT EXPLAINER:`,

  methodology_overview: `CRITICAL REQUIREMENT - READ CAREFULLY:
You MUST cover ALL major topics present in the source material.
Do not focus primarily on one or two topics while neglecting others.
Ensure each major theme receives balanced, thorough coverage.
If the sources cover 6+ distinct topics, each should be addressed meaningfully.

Create a comprehensive overview of the methodological approaches found in the sources. Begin with an introduction that explains the purpose and scope of the methodologies covered. Systematically document the research methods, frameworks applied, data collection techniques, and analysis approaches used. For each method, explain its purpose, how it was implemented, and what it was designed to achieve. Use clear headings and structured formatting to make the information easily accessible to researchers or practitioners who may need to understand or apply these methods.

## Introduction
[Purpose and scope of the methodologies]

## Research Methods
[Detailed description of approaches and techniques used]

## Frameworks Applied
[Theoretical or practical models and their applications]

## Data Collection
[How information was gathered, including tools and processes]

## Analysis Approaches
[How data was processed, analyzed, and interpreted]

## Methodological Considerations
[Strengths, limitations, and best practices]

Based on the following source material:

{content}

METHODOLOGY OVERVIEW:`,

  custom: `CRITICAL REQUIREMENT - READ CAREFULLY:
You MUST cover ALL major topics present in the source material.
Do not focus primarily on one or two topics while neglecting others.
Ensure each major theme receives balanced, thorough coverage.
If the sources cover 6+ distinct topics, each should be addressed meaningfully.

{customPrompt}

{content}`,
};

export class ReportGraph {
  private fastLlm: ChatTogetherAI;
  private smartLlm: ChatTogetherAI;
  private maxTokens: number;

  constructor(apiKey: string, mapModel: string, reduceModel: string, maxTokens: number = 24000) {
    // Fast model for map phase (parallel content extraction)
    this.fastLlm = new ChatTogetherAI({
      apiKey,
      model: mapModel,
      temperature: 0.7,
      timeout: GRAPH_CONFIG.MAP_TIMEOUT_MS,
    });

    // Smart model for reduce/merge phases (quality writing and synthesis)
    this.smartLlm = new ChatTogetherAI({
      apiKey,
      model: reduceModel,
      temperature: 0.7,
      timeout: GRAPH_CONFIG.REDUCE_TIMEOUT_MS,
    });

    this.maxTokens = maxTokens;
  }

  private estimateTokens(text: string): number {
    // Rough approximation: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  // Generate a short hash for identifying chunks in logs
  private chunkHash(chunk: string): string {
    // First 50 chars + length + last 20 chars for identification
    const start = chunk.substring(0, 50).replace(/\n/g, ' ');
    const end = chunk.substring(Math.max(0, chunk.length - 20)).replace(/\n/g, ' ');
    return `[${chunk.length} chars] "${start}..."..."${end}"`;
  }

  // Extract topics from map output text
  private extractTopicsFromOutput(output: string): string[] {
    const topics: string[] = [];

    // Try to extract topics from "Main Topics:" section
    // Handle format: "**Main Topics:** 1. Topic one 2. Topic two 3. Topic three"
    const mainTopicsMatch = output.match(/\*{0,2}Main Topics:\*{0,2}\s*(.+?)(?=\n\n|\n\*{0,2}Main|\n\*{0,2}Key|\n\*{0,2}Important|$)/is);
    if (mainTopicsMatch) {
      const topicsText = mainTopicsMatch[1].trim();

      // Try to extract numbered topics like "1. Topic one 2. Topic two"
      const numberedTopics = topicsText.match(/\d+\.\s+([^.\d]+?)(?=\s+\d+\.|$)/g);
      if (numberedTopics) {
        const extracted = numberedTopics.map(t => t.replace(/^\d+\.\s*/, '').trim()).filter(t => t.length > 2);
        topics.push(...extracted.slice(0, 5));
      } else {
        // Fallback: split by common delimiters
        const extractedTopics = topicsText.split(/,|;|\n|\d+\.|and|&/i)
          .map(t => t.trim().replace(/^\*+|\*+$/g, ''))
          .filter(t => t.length > 3 && !t.match(/Main Topics/i));
        topics.push(...extractedTopics.slice(0, 5));
      }
    }

    return topics.length > 0 ? topics : ['Unknown'];
  }

  // Group map outputs by extracted topics for analysis
  private groupOutputsByTopic(outputs: string[]): Record<string, number> {
    const topics: Record<string, number> = {};

    for (const output of outputs) {
      const extractedTopics = this.extractTopicsFromOutput(output);
      // Use the first extracted topic as the primary topic
      const primaryTopic = extractedTopics[0] || 'Unknown';
      topics[primaryTopic] = (topics[primaryTopic] || 0) + 1;
    }

    return topics;
  }

  // Analyze all topics from outputs for comprehensive logging
  private analyzeAllTopics(outputs: string[]): { topics: Record<string, number>, allTopics: string[] } {
    const topicCounts: Record<string, number> = {};
    const allTopics: string[] = [];

    for (const output of outputs) {
      const extractedTopics = this.extractTopicsFromOutput(output);
      allTopics.push(...extractedTopics);

      for (const topic of extractedTopics) {
        topicCounts[topic] = (topicCounts[topic] || 0) + 1;
      }
    }

    return { topics: topicCounts, allTopics };
  }

  // Conditional routing function - returns Send objects for fan-out or 'collapse' string
  routeToMap(state: OverallStateType): Send[] | 'collapse' {
    // ============================================================
    // DEBUG: Routing Analysis
    // ============================================================
    console.log('\n' + '='.repeat(80));
    console.log('[ReportGraph] ===== ROUTE TO MAP PHASE =====');
    console.log('='.repeat(80));

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      phase: 'route_to_map',
      documentCount: state.documentIds?.length || 0,
      documentIds: state.documentIds || [],
      chunkCount: state.chunks?.length || 0,
      reportType: state.reportType,
    }, null, 2));

    // Log each chunk with preview for source identification
    if (state.chunks && state.chunks.length > 0) {
      console.log(`\n[ReportGraph] Chunk breakdown:`);
      state.chunks.forEach((chunk, idx) => {
        const preview = this.chunkHash(chunk);
        console.log(`  [${idx + 1}/${state.chunks!.length}] ${preview.substring(0, 150)}...`);
      });
      console.log('');
    }

    // If no chunks, skip to collapse
    if (state.chunks.length === 0) {
      console.warn('[ReportGraph] No chunks to process, routing to collapse');
      return 'collapse';
    }

    // Validate and pack chunks
    const validatedChunks = validateChunks(state.chunks);
    const packedChunks = packChunks(validatedChunks, GRAPH_CONFIG.MAP_CHUNK_SIZE);

    console.log(`[ReportGraph] Creating ${packedChunks.length} parallel map tasks`);

    // Create Send objects with chunk index tracking
    return packedChunks.map((chunk, idx) => {
      const preview = chunk.substring(0, 100).replace(/\n/g, ' ');
      console.log(`  [Task ${idx + 1}/${packedChunks.length}] ${preview}... (${chunk.length} chars)`);
      return new Send('map_process', {
        chunk,
        chunkIndex: idx,
        reportType: state.reportType,
        customPrompt: state.customPrompt,
      });
    });
  }

  // Node: Map phase (runs in parallel via Send)
  // Accepts ChunkProcessState with minimal data for this branch
  async mapProcess(state: ChunkProcessState): Promise<Partial<OverallStateType>> {
    const { chunk, chunkIndex, reportType, customPrompt } = state;
    const startTime = Date.now();

    // ============================================================
    // DEBUG: Map Phase - Processing Individual Chunk
    // ============================================================
    const chunkId = chunkIndex !== undefined ? `[Chunk ${chunkIndex + 1}]` : '[Chunk ?]';
    console.log(`\n${'='.repeat(80)}`);
    console.log(`[ReportGraph] ===== MAP PROCESS PHASE ${chunkId} =====`);
    console.log('='.repeat(80));
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      phase: 'map_process',
      chunkIndex: chunkIndex,
      chunkLength: chunk.length,
      chunkPreview: chunk.substring(0, 150).replace(/\n/g, ' '),
      reportType: reportType,
    }, null, 2));

    const promptTemplate = MAP_PROMPTS[reportType] || MAP_PROMPTS['custom'];
    const prompt = promptTemplate
      .replace('{chunk}', chunk)
      .replace('{customPrompt}', customPrompt || '');

    console.log(`[ReportGraph] ${chunkId} Sending prompt to LLM (${prompt.length} chars)...`);

    let output: string;
    try {
      // Add timeout wrapper
      const response = await Promise.race([
        this.fastLlm.invoke([
          new SystemMessage('You are a professional content analyzer and writer.'),
          new HumanMessage(prompt),
        ]),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Map timeout')), GRAPH_CONFIG.MAP_TIMEOUT_MS - 1000)
        )
      ]) as any;
      output = response.content.toString();
    } catch (error) {
      console.error(`[ReportGraph] ${chunkId} ERROR:`, error);
      // Return a fallback output so processing can continue
      output = `- Main Topics: Error processing chunk\n- Error: ${error instanceof Error ? error.message : 'Unknown error'}\n\n[Fallback: This chunk could not be processed due to timeout or error. The report will continue with other chunks.]`;
    }

    const elapsed = Date.now() - startTime;

    // Extract topics from this output for logging
    const extractedTopics = this.extractTopicsFromOutput(output);

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      phase: 'map_process_complete',
      chunkIndex: chunkIndex,
      outputLength: output.length,
      processingTimeMs: elapsed,
      extractedTopics: extractedTopics,
      outputPreview: output.substring(0, 300).replace(/\n/g, ' '),
    }, null, 2));

    console.log(`[ReportGraph] ${chunkId} Extracted topics: ${extractedTopics.join(', ')}`);

    // Return single output in array - reducer will concatenate all outputs
    return {
      mapOutputs: [output],
    };
  }

  // Node: Collapse phase (if needed)
  async collapse(state: OverallStateType): Promise<Partial<OverallStateType>> {
    // ============================================================
    // DEBUG: Collapse Phase Analysis
    // ============================================================
    console.log(`\n${'='.repeat(80)}`);
    console.log('[ReportGraph] ===== COLLAPSE PHASE =====');
    console.log('='.repeat(80));

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      phase: 'collapse',
      mapOutputsReceived: state.mapOutputs.length,
      mapOutputsDetails: state.mapOutputs.map((output, idx) => ({
        index: idx,
        length: output.length,
        topics: this.extractTopicsFromOutput(output),
        preview: output.substring(0, 100).replace(/\n/g, ' '),
      })),
    }, null, 2));

    // Analyze topic distribution
    const { topics: topicDistribution, allTopics } = this.analyzeAllTopics(state.mapOutputs);
    console.log(`[ReportGraph] Topic distribution across map outputs:`, JSON.stringify(topicDistribution, null, 2));
    console.log(`[ReportGraph] All unique topics found: ${[...new Set(allTopics)].join(', ')}`);

    // Safety check: if no mapOutputs, return early
    if (!state.mapOutputs || state.mapOutputs.length === 0) {
      console.error('[ReportGraph] Collapse: ERROR - No mapOutputs received!');
      return {
        ...state,
        collapsedOutputs: [],
        status: 'reducing',
      };
    }

    const totalTokens = state.mapOutputs.reduce(
      (sum, s) => sum + this.estimateTokens(s),
      0
    );

    console.log(`[ReportGraph] Collapse: total tokens ${totalTokens}, max tokens ${this.maxTokens}`);

    if (totalTokens <= this.maxTokens) {
      console.log('[ReportGraph] Collapse: skipping recursive collapse, using mapOutputs directly');
      return {
        ...state,
        collapsedOutputs: state.mapOutputs,
        status: 'reducing',
      };
    }

    // Recursive collapse
    console.log('[ReportGraph] Collapse: performing recursive collapse');
    const collapsed = await this.recursiveCollapse(state.mapOutputs);
    return {
      ...state,
      collapsedOutputs: collapsed,
      status: 'reducing',
    };
  }

  private async recursiveCollapse(summaries: string[]): Promise<string[]> {
    const totalTokens = summaries.reduce(
      (sum, s) => sum + this.estimateTokens(s),
      0
    );

    if (totalTokens <= this.maxTokens) {
      return summaries;
    }

    // Dynamic grouping based on token budget
    const targetGroupTokens = this.maxTokens * 0.8; // Leave 20% buffer
    const collapsed: string[] = [];
    let currentGroup: string[] = [];
    let currentTokens = 0;

    for (const summary of summaries) {
      const tokens = this.estimateTokens(summary);
      if (currentTokens + tokens > targetGroupTokens && currentGroup.length > 0) {
        collapsed.push(await this.collapseGroup(currentGroup));
        currentGroup = [summary];
        currentTokens = tokens;
      } else {
        currentGroup.push(summary);
        currentTokens += tokens;
      }
    }

    if (currentGroup.length > 0) {
      collapsed.push(await this.collapseGroup(currentGroup));
    }

    // Recursively check if still too large
    return this.recursiveCollapse(collapsed);
  }

  private async collapseGroup(group: string[]): Promise<string> {
    const combined = group.join('\n\n---\n\n');

    const prompt = `Condense these summaries into a brief summary while retaining all key information:\n\n${combined}\n\nCONDENSED:`;

    const response = await this.smartLlm.invoke([
      new SystemMessage('You are a skilled summarizer.'),
      new HumanMessage(prompt),
    ]);

    return response.content.toString();
  }

  // Node: Reduce phase
  async reduce(state: OverallStateType): Promise<Partial<OverallStateType>> {
    // ============================================================
    // DEBUG: Reduce Phase Analysis
    // ============================================================
    console.log(`\n${'='.repeat(80)}`);
    console.log('[ReportGraph] ===== REDUCE PHASE =====');
    console.log('='.repeat(80));

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      phase: 'reduce',
      collapsedOutputsCount: state.collapsedOutputs.length,
      reportType: state.reportType,
    }, null, 2));

    // Analyze topics from collapsed outputs for reduce phase
    const { topics: topicDistribution, allTopics } = this.analyzeAllTopics(state.collapsedOutputs);

    // Filter out error topics and get unique valid topics
    const validTopics = [...new Set(allTopics)].filter(t =>
      !t.includes('Error') && !t.includes('error') && !t.includes('timeout') && !t.includes('Unknown')
    );

    console.log(`[ReportGraph] Topic distribution before reduce:`, JSON.stringify(topicDistribution, null, 2));
    console.log(`[ReportGraph] Total unique topics to synthesize: ${validTopics.length}`);
    console.log(`[ReportGraph] Valid topics: ${validTopics.join(', ')}`);

    const combined = state.collapsedOutputs.join('\n\n---\n\n');

    console.log(`[ReportGraph] Reduce: combined content length: ${combined.length} chars`);

    let promptTemplate = REDUCE_PROMPTS[state.reportType] || REDUCE_PROMPTS['custom'];

    // Inject explicit topic requirements into the prompt
    if (validTopics.length > 0) {
      const topicList = validTopics.map((t, i) => `${i + 1}. ${t}`).join('\n');
      const topicRequirement = `

====================
EXPLICIT TOPIC COVERAGE REQUIREMENT
====================
You MUST create dedicated sections for EACH of the following ${validTopics.length} topics:
${topicList}

Each topic must receive approximately equal attention (${Math.round(100 / validTopics.length)}% of content each).
Do NOT combine topics or focus primarily on one.
====================

`;

      // Insert topic requirement after the CRITICAL REQUIREMENT section
      promptTemplate = promptTemplate.replace(
        /(CRITICAL REQUIREMENT[\s\S]*?)(\n\n##|Create a comprehensive)/,
        `$1${topicRequirement}$2`
      );
    }

    const prompt = promptTemplate
      .replace('{content}', combined)
      .replace('{customPrompt}', state.customPrompt || '');

    console.log(`[ReportGraph] Reduce: prompt length: ${prompt.length} chars`);
    console.log(`[ReportGraph] Reduce: prompt preview: ${prompt.substring(0, 500)}...`);

    const startTime = Date.now();
    let finalOutput: string;

    try {
      // Add timeout wrapper
      const response = await Promise.race([
        this.smartLlm.invoke([
          new SystemMessage('You are a professional content writer and editor.'),
          new HumanMessage(prompt),
        ]),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Reduce timeout')), GRAPH_CONFIG.REDUCE_TIMEOUT_MS - 1000)
        )
      ]) as any;
      finalOutput = response.content.toString();
    } catch (error) {
      console.error(`[ReportGraph] Reduce ERROR:`, error);
      // Return a fallback output
      finalOutput = `# Report Generation Error\n\nError: ${error instanceof Error ? error.message : 'Unknown error'}\n\nThe report generation could not be completed due to a timeout or error. Please try again with fewer documents or a shorter report type.`;
    }

    const elapsed = Date.now() - startTime;

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      phase: 'reduce_complete',
      finalOutputLength: finalOutput.length,
      processingTimeMs: elapsed,
      outputPreview: finalOutput.substring(0, 200).replace(/\n/g, ' '),
    }, null, 2));

    console.log(`[ReportGraph] Reduce: final output length: ${finalOutput.length} chars (took ${elapsed}ms)`);

    return {
      ...state,
      finalOutput,
      status: 'completed',
    };
  }

  // Node: Merge final results
  async mergeResults(state: OverallStateType): Promise<Partial<OverallStateType>> {
    console.log(`\n${'='.repeat(80)}`);
    console.log('[ReportGraph] ===== GENERATION COMPLETE =====');
    console.log('='.repeat(80));
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      phase: 'merge_results',
      status: 'completed',
      finalOutputLength: state.finalOutput?.length || 0,
    }, null, 2));

    return {
      ...state,
      status: 'completed',
    };
  }

  // Build the graph using the newer Annotation API
  buildGraph() {
    const builder = new StateGraph(OverallState);

    // Add nodes with proper types
    builder.addNode('map_process', (state: ChunkProcessState) => this.mapProcess(state));
    builder.addNode('collapse', (state: OverallStateType) => this.collapse(state));
    builder.addNode('reduce', (state: OverallStateType) => this.reduce(state));
    builder.addNode('merge_results', (state: OverallStateType) => this.mergeResults(state));

    // Simplified edges - no batch processing loop
    builder.addConditionalEdges(
      START,
      (s: OverallStateType) => this.routeToMap(s)
    );

    builder.addEdge('map_process' as never, 'collapse' as never);
    builder.addEdge('collapse' as never, 'reduce' as never);
    builder.addEdge('reduce' as never, 'merge_results' as never);
    builder.addEdge('merge_results' as never, END as never);

    return builder.compile();
  }
}
