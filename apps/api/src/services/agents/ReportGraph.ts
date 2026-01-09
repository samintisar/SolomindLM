import { StateGraph, START, END, Send, Annotation } from '@langchain/langgraph';
import { ChatTogetherAI } from '@langchain/community/chat_models/togetherai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { env } from '../../config/env.js';

// Shared utilities for production-level patterns
import {
  invokeWithTimeout,
  invokeWithRetry,
  packChunks as sharedPackChunks,
  validateChunks as sharedValidateChunks,
  logInfo,
  logWarn,
  logError,
  logPhaseStart,
  logPhaseComplete,
  logBanner,
  sanitizeUserInput,
} from './shared/index.js';

// Configuration constants - now with env variable support
const GRAPH_CONFIG = {
  MAP_CHUNK_SIZE: parseInt(env.REPORT_MAP_CHUNK_SIZE || '20000', 10), // Reduced from 30K for faster, more reliable processing
  REDUCE_CHUNK_SIZE: parseInt(env.REPORT_REDUCE_CHUNK_SIZE || '60000', 10),
  MAP_TIMEOUT_MS: 200000, // Increased from 120s to 180s for large chunks
  REDUCE_TIMEOUT_MS: 300000, // Increased from 180s to 300s for synthesis
} as const;

// Internal processing configuration (magic numbers)
const PROCESSING_CONFIG = {
  MIN_CHUNK_LENGTH: 50,
  MAX_CHUNK_LENGTH: 50000,
  COLLAPSE_BUFFER_RATIO: 0.8,
  PREVIEW_LENGTH: 100,
  HASH_START_LENGTH: 50,
  HASH_END_LENGTH: 20,
  OUTPUT_PREVIEW_LENGTH: 300,
  TOPIC_PREVIEW_LENGTH: 150,
  LOG_PREVIEW_LENGTH: 500,
  MAX_TOPICS_PER_CHUNK: 5,
  TOKEN_ESTIMATION_RATIO: 3, // Conservative: 3 chars per token
  TOPIC_CACHE_SIZE: 100,
  TOPIC_CACHE_KEY_LENGTH: 200,
  MAX_RETRY_ATTEMPTS: 3,
  RETRY_BACKOFF_MS: 1000,
  MAX_PROMPT_LENGTH: 5000,
} as const;

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Wrapper around shared packChunks utility with ReportGraph logging.
 */
export function packChunks(chunks: string[], targetSize: number = GRAPH_CONFIG.MAP_CHUNK_SIZE): string[] {
  return sharedPackChunks(chunks, {
    targetSize,
    minChunkLength: PROCESSING_CONFIG.MIN_CHUNK_LENGTH,
    maxChunkLength: PROCESSING_CONFIG.MAX_CHUNK_LENGTH,
    agentName: 'ReportGraph',
  });
}

/**
 * Wrapper around shared validateChunks utility with ReportGraph logging.
 */
export function validateChunks(chunks: string[]): string[] {
  return sharedValidateChunks(chunks, {
    targetSize: GRAPH_CONFIG.MAP_CHUNK_SIZE,
    minChunkLength: PROCESSING_CONFIG.MIN_CHUNK_LENGTH,
    maxChunkLength: PROCESSING_CONFIG.MAX_CHUNK_LENGTH,
    agentName: 'ReportGraph',
  });
}

// ============================================================
// STATE DEFINITIONS
// ============================================================
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
  reduceRetryCount: Annotation<number>({
    reducer: (_x: number, y?: number) => y ?? _x,
    default: () => 0,
  }),
  // Progress tracking for streaming
  progress: Annotation<{
    phase: string;
    percentage: number;
    message: string;
    chunksCompleted?: number;
    totalChunks?: number;
  }>({
    reducer: (_x, y?: any) => y ?? _x,
    default: () => ({ phase: 'initializing', percentage: 0, message: 'Initializing...' }),
  }),
});

export type OverallStateType = typeof OverallState.State;

// Minimal state for parallel map processing - only what each chunk needs
export interface ChunkProcessState {
  chunk: string;
  chunkIndex?: number; // Track which chunk this is for debugging
  totalChunks?: number; // Total chunks for progress tracking
  reportType: string;
  customPrompt?: string;
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
  private topicCache = new Map<string, string[]>();
  private maxTokens: number;

  constructor(apiKey: string, mapModel: string, reduceModel: string, maxTokens: number = 64000) {
    // Fast model for map phase (parallel content extraction)
    this.fastLlm = new ChatTogetherAI({
      apiKey,
      model: mapModel,
      temperature: 0.3, // Lower temp for factual extraction
      timeout: GRAPH_CONFIG.MAP_TIMEOUT_MS,
      maxTokens: parseInt(env.REPORT_MAP_MAX_OUTPUT_TOKENS || '8192', 10),
    });

    // Smart model for reduce/merge phases (quality writing and synthesis)
    // Use high maxTokens for reduce phase to generate complete reports without truncation
    this.smartLlm = new ChatTogetherAI({
      apiKey,
      model: reduceModel,
      temperature: 0.5, // Moderate temp for engaging writing
      timeout: GRAPH_CONFIG.REDUCE_TIMEOUT_MS,
      maxTokens: parseInt(env.REPORT_REDUCE_MAX_OUTPUT_TOKENS || '32000', 10),
    });

    this.maxTokens = maxTokens; // Used for collapse phase logic
  }

  private estimateTokens(text: string): number {
    // Conservative estimation: 1 token ≈ 3 characters
    return Math.ceil(text.length / PROCESSING_CONFIG.TOKEN_ESTIMATION_RATIO);
  }

  // Generate a short hash for identifying chunks in logs
  private chunkHash(chunk: string): string {
    const start = chunk.substring(0, PROCESSING_CONFIG.HASH_START_LENGTH).replace(/\n/g, ' ');
    const end = chunk.substring(Math.max(0, chunk.length - PROCESSING_CONFIG.HASH_END_LENGTH)).replace(/\n/g, ' ');
    return `[${chunk.length} chars] "${start}..."..."${end}"`;
  }

  // Sanitize user input to prevent prompt injection
  private sanitizeUserInput(input: string): string {
    if (!input) return '';
    return input
      .replace(/\n{3,}/g, '\n\n') // Limit consecutive newlines
      .replace(/system:|assistant:|user:/gi, '') // Remove role markers
      .replace(/<\|.*?\|>/g, '') // Remove special tokens
      .trim()
      .substring(0, PROCESSING_CONFIG.MAX_PROMPT_LENGTH);
  }

  // Helper method to invoke with timeout and proper cleanup
  private async invokeWithTimeout<T>(
    invokeFn: () => Promise<T>,
    timeoutMs: number,
    phase: string
  ): Promise<T> {
    let timeoutId!: NodeJS.Timeout; // Definite assignment assertion - will be set in Promise executor

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`${phase} timeout after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([invokeFn(), timeoutPromise]);
      clearTimeout(timeoutId);
      return result;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.message.includes('timeout')) {
        throw new Error(`${phase} phase exceeded timeout of ${timeoutMs}ms`);
      }
      throw error;
    }
  }

  // Helper to extract message content safely
  private getMessageContent(response: unknown): string {
    if (typeof response === 'object' && response !== null) {
      const msg = response as { content?: unknown };
      if (typeof msg.content === 'string') {
        return msg.content;
      }
      if (typeof msg.content === 'object' && msg.content !== null) {
        // Handle structured content
        if (typeof (msg.content as { toString?: () => string }).toString === 'function') {
          return (msg.content as { toString: () => string }).toString();
        }
      }
    }
    // Fallback
    return String(response);
  }

  // Retry logic with exponential backoff
  private async invokeWithRetry<T>(
    fn: () => Promise<T>,
    maxRetries: number = PROCESSING_CONFIG.MAX_RETRY_ATTEMPTS,
    phase: string
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        // Don't retry on validation or timeout errors (already handled)
        if (error instanceof Error &&
            (error.message.includes('Invalid') ||
             error.message.includes('validation') ||
             error.message.includes('timeout'))) {
          throw error;
        }

        console.warn(
          `[ReportGraph] ${phase} attempt ${attempt + 1}/${maxRetries} failed:`,
          error instanceof Error ? error.message : String(error)
        );

        if (attempt < maxRetries - 1) {
          const backoff = PROCESSING_CONFIG.RETRY_BACKOFF_MS * Math.pow(2, attempt);
          console.log(`[ReportGraph] Retrying ${phase} in ${backoff}ms...`);
          await new Promise(resolve => setTimeout(resolve, backoff));
        }
      }
    }

    throw lastError || new Error(`${phase} failed after ${maxRetries} attempts`);
  }

  // Extract topics from map output text (with caching)
  private extractTopicsFromOutput(output: string): string[] {
    // Check cache first
    const cacheKey = output.substring(0, PROCESSING_CONFIG.TOPIC_CACHE_KEY_LENGTH);
    if (this.topicCache.has(cacheKey)) {
      return this.topicCache.get(cacheKey)!;
    }

    const topics = this.extractTopicsInternal(output);

    // Update cache with LRU eviction
    if (this.topicCache.size >= PROCESSING_CONFIG.TOPIC_CACHE_SIZE) {
      const firstKey = this.topicCache.keys().next().value;
      if (firstKey) {
        this.topicCache.delete(firstKey);
      }
    }
    this.topicCache.set(cacheKey, topics);

    return topics;
  }

  // Internal topic extraction with single-pass parsing
  private extractTopicsInternal(output: string): string[] {
    const topics: string[] = [];
    const lines = output.split('\n');
    let inTopicsSection = false;

    for (const line of lines) {
      // Check for Main Topics section header
      if (/\*{0,2}Main Topics:\*{0,2}/i.test(line)) {
        inTopicsSection = true;
        continue;
      }

      // Exit topics section when hitting another section
      if (inTopicsSection) {
        if (line.match(/^\*{0,2}(Key|Important|Learning|Surprising|Notable|Actionable|Technical|Supporting)/i)) {
          break;
        }

        // Extract numbered topics
        const match = line.match(/^\s*\d+\.\s*(.+)$/);
        if (match) {
          const topic = match[1].trim();
          if (topic.length > 2 && topics.length < PROCESSING_CONFIG.MAX_TOPICS_PER_CHUNK) {
            topics.push(topic);
          }
        }
      }
    }

    // Fallback: try regex extraction if single-pass didn't work
    if (topics.length === 0) {
      const mainTopicsMatch = output.match(/\*{0,2}Main Topics:\*{0,2}\s*([\s\S]+?)(?=\n\n|\n\*{0,2}Main|\n\*{0,2}Key|\n\*{0,2}Important|$)/i);
      if (mainTopicsMatch) {
        const topicsText = mainTopicsMatch[1].trim();
        const numberedTopics = topicsText.match(/\d+\.\s+([^.\d]+?)(?=\s+\d+\.|$)/g);
        if (numberedTopics) {
          const extracted = numberedTopics
            .map(t => t.replace(/^\d+\.\s*/, '').trim())
            .filter(t => t.length > 2)
            .slice(0, PROCESSING_CONFIG.MAX_TOPICS_PER_CHUNK);
          topics.push(...extracted);
        } else {
          // Final fallback: split by delimiters
          const extractedTopics = topicsText.split(/,|;|\n|\d+\.|and|&/i)
            .map(t => t.trim().replace(/^\*+|\*+$/g, ''))
            .filter(t => t.length > 3 && !t.match(/Main Topics/i))
            .slice(0, PROCESSING_CONFIG.MAX_TOPICS_PER_CHUNK);
          topics.push(...extractedTopics);
        }
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

  // Validate input state before processing
  private validateInput(state: OverallStateType): Partial<OverallStateType> {
    console.log('\n' + '='.repeat(80));
    console.log('[ReportGraph] ===== INPUT VALIDATION =====');
    console.log('='.repeat(80));

    const errors: string[] = [];

    if (!state.chunks || state.chunks.length === 0) {
      errors.push('No chunks provided for processing');
    }

    if (!state.reportType) {
      errors.push('Report type is required');
    }

    if (state.reportType && !MAP_PROMPTS[state.reportType]) {
      errors.push(`Invalid report type: ${state.reportType}. Valid types: ${Object.keys(MAP_PROMPTS).join(', ')}`);
    }

    if (errors.length > 0) {
      console.error('[ReportGraph] Validation failed:', errors);
      return {
        ...state,
        status: 'error',
        finalOutput: `# Validation Error\n\n${errors.map(e => `- ${e}`).join('\n')}\n\nPlease fix these issues and try again.`,
      };
    }

    console.log('[ReportGraph] Validation passed');
    console.log(`  - Document IDs: ${state.documentIds?.length || 0}`);
    console.log(`  - Chunks: ${state.chunks?.length || 0}`);
    console.log(`  - Report Type: ${state.reportType}`);
    console.log(`  - Custom Prompt: ${state.customPrompt ? 'Yes (' + state.customPrompt.length + ' chars)' : 'No'}`);

    return state;
  }

  // Validate report completeness for truncation detection
  private validateReportCompleteness(output: string, reportType: string): {
    isComplete: boolean;
    missing: string[];
  } {
    const missing: string[] = [];

    if (reportType === 'study_guide') {
      // Check for required sections with flexible matching
      const requiredSections = [
        'Learning Objectives',
        'Study Notes',
        'Quiz Questions',
        'Answer Key',
        'Essay Questions',
        'Glossary'
      ];

      for (const section of requiredSections) {
        // More flexible matching - check for section in various formats
        const patterns = [
          new RegExp(`##\\s*${section}`, 'i'),  // ## Learning Objectives
          new RegExp(`###\\s*${section}`, 'i'), // ### Learning Objectives
          new RegExp(`\\*\\*${section}\\*\\*`, 'i'), // **Learning Objectives**
          new RegExp(`${section}`, 'i'), // Anywhere in text (case-insensitive)
        ];

        const found = patterns.some(pattern => pattern.test(output));

        if (!found) {
          missing.push(`Missing section: ${section}`);
        }
      }

      // Check for complete quiz (should have 10 questions)
      const quizMatches = output.match(/^\d+\.\s+.+$/gm) || [];
      if (quizMatches.length < 10) {
        missing.push(`Incomplete quiz (${quizMatches.length}/10 questions)`);
      }

      // Check for glossary entries
      const glossaryPatterns = [
        /##\s*Glossary/i,
        /###\s*Glossary/i,
        /\*\*Glossary\*\*/i,
      ];
      const hasGlossary = glossaryPatterns.some(pattern => pattern.test(output));

      if (hasGlossary) {
        // Extract glossary section and count entries
        const glossaryMatch = output.match(/##\s*Glossary[\s\S]+$/i);
        if (glossaryMatch) {
          const glossaryEntries = glossaryMatch[0].match(/^[-*]\s+\*\*\w+/gm) || [];
          if (glossaryEntries.length < 5) {
            missing.push(`Incomplete glossary (${glossaryEntries.length} entries)`);
          }
        }
      }

      // Check for abrupt ending
      const lastLine = output.trim().split('\n').pop() || '';
      if (lastLine.length > 0 && !lastLine.match(/[.!?"]$/) && !lastLine.startsWith('#')) {
        missing.push('Abrupt ending detected (likely truncated)');
      }
    } else if (reportType === 'briefing' || reportType === 'summary' || reportType === 'technical_report') {
      // Check for abrupt ending - common truncation indicator
      const lastLine = output.trim().split('\n').pop() || '';
      if (lastLine.length > 0 && !lastLine.match(/[.!?]$/) && !lastLine.startsWith('#')) {
        missing.push('Abrupt ending detected (likely truncated)');
      }

      // Check if expected sections exist based on report type (flexible matching)
      if (reportType === 'briefing') {
        const expectedSections = ['Executive Summary', 'Main Themes', 'Key Findings', 'Recommendations'];
        for (const section of expectedSections) {
          if (!new RegExp(section, 'i').test(output)) {
            missing.push(`Missing section: ${section}`);
          }
        }
      }
    }

    return {
      isComplete: missing.length === 0,
      missing,
    };
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
        totalChunks: packedChunks.length,
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
      .replace('{customPrompt}', this.sanitizeUserInput(customPrompt || ''));

    console.log(`[ReportGraph] ${chunkId} Sending prompt to LLM (${prompt.length} chars)...`);

    let output: string;
    try {
      // Use retry with timeout wrapper for better resilience
      const response = await this.invokeWithRetry(
        () => this.invokeWithTimeout(
          () => this.fastLlm.invoke([
            new SystemMessage('You are a professional content analyzer and writer.'),
            new HumanMessage(prompt),
          ]),
          GRAPH_CONFIG.MAP_TIMEOUT_MS,
          'Map'
        ),
        PROCESSING_CONFIG.MAX_RETRY_ATTEMPTS,
        `Map ${chunkId}`
      );
      output = this.getMessageContent(response);
    } catch (error) {
      const errorContext = {
        timestamp: new Date().toISOString(),
        chunkId,
        chunkLength: chunk.length,
        reportType,
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack?.split('\n').slice(0, 3).join('\n'), // First 3 lines of stack
        } : String(error),
      };
      console.error('[ReportGraph] Map process error:', JSON.stringify(errorContext, null, 2));

      // Return a fallback output so processing can continue
      output = `- Main Topics: Error processing chunk
- Error: ${error instanceof Error ? error.message : 'Unknown error'}
- Chunk Info: ${chunk.length} chars, type: ${reportType}

[Fallback: This chunk could not be processed due to timeout or error. The report will continue with other chunks.]`;
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
      progress: {
        phase: 'map_process',
        percentage: Math.min(10 + ((chunkIndex ?? 0) * 30), 60),
        message: `Chunk ${(chunkIndex ?? 0) + 1}/${state.totalChunks ?? '?'} complete`,
        chunksCompleted: (chunkIndex ?? 0) + 1,
        totalChunks: state.totalChunks,
      },
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
    console.log(`[ReportGraph] All unique topics found: ${Array.from(new Set(allTopics)).join(', ')}`);

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

    console.log(`[ReportGraph] Collapse: total tokens ${totalTokens}`);

    // Always perform recursive collapse to synthesize map outputs
    console.log('[ReportGraph] Collapse: performing recursive collapse');
    const collapsed = await this.recursiveCollapse(state.mapOutputs);
    return {
      ...state,
      collapsedOutputs: collapsed,
      status: 'reducing',
      progress: {
        phase: 'collapse',
        percentage: 70,
        message: `Collapsed ${state.mapOutputs.length} outputs into ${collapsed.length}`,
      },
    };
  }

  private async recursiveCollapse(summaries: string[]): Promise<string[]> {
    // Stop when we have a small enough number of summaries to synthesize directly
    if (summaries.length <= 3) {
      return summaries;
    }

    // Dynamic grouping - target ~3-4 summaries per group
    const targetGroupSize = 4;
    const groups: string[][] = [];
    let currentGroup: string[] = [];

    for (const summary of summaries) {
      if (currentGroup.length >= targetGroupSize) {
        groups.push([...currentGroup]);
        currentGroup = [summary];
      } else {
        currentGroup.push(summary);
      }
    }

    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }

    // Process groups in parallel for better performance
    console.log(`[ReportGraph] Collapsing ${groups.length} groups in parallel`);
    const collapsed = await Promise.all(
      groups.map((group, idx) => {
        console.log(`[ReportGraph] Collapsing group ${idx + 1}/${groups.length} (${group.length} summaries)`);
        return this.collapseGroup(group);
      })
    );

    // Recursively check if still too large
    return this.recursiveCollapse(collapsed);
  }

  private async collapseGroup(group: string[]): Promise<string> {
    const combined = group.join('\n\n---\n\n');

    // Improved prompt that preserves the structured format with "Main Topics:" section
    const prompt = `Condense these summaries while PRESERVING the structured format.
Keep the "Main Topics:" section intact with all topic listings.
Only condense the detailed explanations while maintaining the overall structure.

${combined}

CONDENSED (maintain topic structure and "Main Topics:" format):`;

    const response = await this.invokeWithRetry(
      () => this.invokeWithTimeout(
        () => this.smartLlm.invoke([
          new SystemMessage('You are a skilled summarizer. Always maintain structured format with topic headers like "Main Topics:"'),
          new HumanMessage(prompt),
        ]),
        GRAPH_CONFIG.REDUCE_TIMEOUT_MS,
        'CollapseGroup'
      ),
      PROCESSING_CONFIG.MAX_RETRY_ATTEMPTS,
      'CollapseGroup'
    );

    return this.getMessageContent(response);
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
    const validTopics = Array.from(new Set(allTopics)).filter(t =>
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
      .replace('{customPrompt}', this.sanitizeUserInput(state.customPrompt || ''));

    console.log(`[ReportGraph] Reduce: prompt length: ${prompt.length} chars`);
    console.log(`[ReportGraph] Reduce: prompt preview: ${prompt.substring(0, 500)}...`);

    const startTime = Date.now();
    let finalOutput: string;

    try {
      // Use retry with timeout wrapper for better resilience
      const response = await this.invokeWithRetry(
        () => this.invokeWithTimeout(
          () => this.smartLlm.invoke([
            new SystemMessage('You are a professional content writer and editor.'),
            new HumanMessage(prompt),
          ]),
          GRAPH_CONFIG.REDUCE_TIMEOUT_MS,
          'Reduce'
        ),
        PROCESSING_CONFIG.MAX_RETRY_ATTEMPTS,
        'Reduce'
      );

      // Extract response metadata for truncation detection
      const responseAny = response as any;
      const metadata = responseAny.response_metadata || {};
      const finishReason = metadata.finish_reason || metadata.tokenUsage?.finish_reason;

      // Log response analysis
      console.log('[ReportGraph] ===== RESPONSE ANALYSIS =====');
      console.log('[ReportGraph] Content length:', responseAny.content?.toString()?.length || 'N/A');
      console.log('[ReportGraph] Estimated tokens:', Math.ceil((responseAny.content?.toString()?.length || 0) / 3));
      console.log('[ReportGraph] Finish reason:', finishReason);
      console.log('[ReportGraph] Token usage:', JSON.stringify(metadata.token_usage || metadata));
      console.log('[ReportGraph] Last 200 chars:', (responseAny.content?.toString() || '').slice(-200));
      console.log('[ReportGraph] =====================================');

      finalOutput = this.getMessageContent(response);

      // Check for truncation
      if (finishReason === 'length') {
        console.error('[ReportGraph] ⚠️ OUTPUT TRUNCATED BY TOKEN LIMIT!');
        console.error('[ReportGraph] Increase REPORT_REDUCE_MAX_OUTPUT_TOKENS in env');

        finalOutput += '\n\n---\n\n⚠️ **This report was truncated due to output length limits. ' +
          'To generate a complete report, increase the REPORT_REDUCE_MAX_OUTPUT_TOKENS setting ' +
          'or reduce the number of source documents.**';
      }

      // Validate report completeness
      const validation = this.validateReportCompleteness(finalOutput, state.reportType);
      if (!validation.isComplete) {
        console.warn('[ReportGraph] Report validation issues:', validation.missing);
        if (finishReason === 'length') {
          console.error('[ReportGraph] Confirmed: truncation likely caused incompleteness');
        }
      }
    } catch (error) {
      const errorContext = {
        timestamp: new Date().toISOString(),
        reportType: state.reportType,
        collapsedOutputsCount: state.collapsedOutputs.length,
        contentLength: combined.length,
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack?.split('\n').slice(0, 3).join('\n'), // First 3 lines of stack
        } : String(error),
      };
      console.error('[ReportGraph] Reduce phase error:', JSON.stringify(errorContext, null, 2));

      // Return a fallback output
      finalOutput = `# Report Generation Error

**Error:** ${error instanceof Error ? error.message : 'Unknown error'}

**Details:**
- Report Type: ${state.reportType}
- Input Size: ${combined.length} characters
- Processed Chunks: ${state.collapsedOutputs.length}

The report generation could not be completed due to a timeout or error. Please try again with fewer documents or a shorter report type.`;
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
      progress: {
        phase: 'reduce',
        percentage: 100,
        message: `Completed: ${state.reportType} report generated`,
      },
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
      progress: {
        phase: 'complete',
        percentage: 100,
        message: 'Report generation complete',
      },
    };
  }

  // Build the graph using the newer Annotation API
  buildGraph() {
    const builder = new StateGraph(OverallState);

    // Add nodes with proper types
    builder.addNode('validate_input', (state: OverallStateType) => this.validateInput(state));
    builder.addNode('map_process', (state: ChunkProcessState) => this.mapProcess(state));
    builder.addNode('collapse', (state: OverallStateType) => this.collapse(state));
    builder.addNode('reduce', (state: OverallStateType) => this.reduce(state));
    builder.addNode('merge_results', (state: OverallStateType) => this.mergeResults(state));

    // Start with validation
    builder.addEdge(START, 'validate_input' as never);

    // After validation, check for errors or proceed to map
    builder.addConditionalEdges(
      'validate_input' as never,
      (s: OverallStateType) => {
        if (s.status === 'error') {
          return 'merge_results';
        }
        return this.routeToMap(s);
      }
    );

    builder.addEdge('map_process' as never, 'collapse' as never);
    builder.addEdge('collapse' as never, 'reduce' as never);
    builder.addEdge('reduce' as never, 'merge_results' as never);
    builder.addEdge('merge_results' as never, END as never);

    return builder.compile();
  }
}
