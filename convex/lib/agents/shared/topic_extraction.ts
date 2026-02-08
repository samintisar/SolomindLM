"use node"
/**
 * Topic extraction utility for LLM agent operations.
 *
 * Provides efficient topic extraction from structured LLM outputs
 * with LRU caching to avoid redundant processing.
 */

/**
 * Configuration for topic extraction behavior.
 */
export interface TopicExtractionConfig {
  /** Maximum number of topics to extract per chunk (default: 5) */
  maxTopicsPerChunk?: number;
  /** Size of LRU cache (default: 100) */
  cacheSize?: number;
  /** Length of output to use as cache key (default: 200) */
  cacheKeyLength?: number;
}

/**
 * Default topic extraction configuration.
 */
const DEFAULT_TOPIC_CONFIG: Required<TopicExtractionConfig> = {
  maxTopicsPerChunk: 5,
  cacheSize: 100,
  cacheKeyLength: 200,
};

/**
 * Topic extractor with LRU caching for efficient repeated operations.
 */
export class TopicExtractor {
  private cache: Map<string, string[]>;
  private config: Required<TopicExtractionConfig>;

  constructor(config: TopicExtractionConfig = {}) {
    this.config = { ...DEFAULT_TOPIC_CONFIG, ...config };
    this.cache = new Map();
  }

  /**
   * Extracts topics from structured LLM output.
   * Uses cache if the same output was processed before.
   *
   * @param output - LLM output containing structured topic information
   * @returns Array of extracted topics
   *
   * @example
   * ```typescript
   * const extractor = new TopicExtractor();
   * const topics = extractor.extractTopics(llmOutput);
   * // Returns: ['Machine Learning', 'Neural Networks', 'Deep Learning']
   * ```
   */
  extractTopics(output: string): string[] {
    // Check cache first
    const cacheKey = output.substring(0, this.config.cacheKeyLength);
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const topics = this.extractTopicsInternal(output);

    // Update cache with LRU eviction
    if (this.cache.size >= this.config.cacheSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(cacheKey, topics);

    return topics;
  }

  /**
   * Internal topic extraction with single-pass parsing.
   */
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
          if (topic.length > 2 && topics.length < this.config.maxTopicsPerChunk) {
            topics.push(topic);
          }
        }
      }
    }

    // Fallback: try regex extraction if single-pass didn't work
    if (topics.length === 0) {
      // Use [\s\S] instead of . with 's' flag for better compatibility
      const mainTopicsMatch = output.match(
        /\*{0,2}Main Topics:\*{0,2}\s*([\s\S]+?)(?=\n\n|\n\*{0,2}Main|\n\*{0,2}Key|\n\*{0,2}Important|$)/i
      );
      if (mainTopicsMatch) {
        const topicsText = mainTopicsMatch[1].trim();
        const numberedTopics = topicsText.match(/\d+\.\s+([^\d]+?)(?=\s+\d+\.|$)/g);
        if (numberedTopics) {
          const extracted = numberedTopics
            .map(t => t.replace(/^\d+\.\s*/, '').trim())
            .filter(t => t.length > 2)
            .slice(0, this.config.maxTopicsPerChunk);
          topics.push(...extracted);
        } else {
          // Final fallback: split by delimiters
          const extractedTopics = topicsText
            .split(/,|;|\n|\d+\.|and|&/i)
            .map(t => t.trim().replace(/^\*+|\*+$/g, ''))
            .filter(t => t.length > 3 && !t.match(/Main Topics/i))
            .slice(0, this.config.maxTopicsPerChunk);
          topics.push(...extractedTopics);
        }
      }
    }

    return topics.length > 0 ? topics : ['Unknown'];
  }

  /**
   * Analyzes topic distribution across multiple outputs.
   *
   * @param outputs - Array of LLM outputs
   * @returns Object with topic counts and all unique topics
   *
   * @example
   * ```typescript
   * const analysis = extractor.analyzeDistribution([output1, output2, output3]);
   * // Returns: { topics: { 'AI': 3, 'ML': 2 }, allTopics: ['AI', 'ML', ...] }
   * ```
   */
  analyzeDistribution(outputs: string[]): {
    topics: Record<string, number>;
    allTopics: string[];
  } {
    const topicCounts: Record<string, number> = {};
    const allTopics: string[] = [];

    for (const output of outputs) {
      const extractedTopics = this.extractTopics(output);
      allTopics.push(...extractedTopics);

      for (const topic of extractedTopics) {
        topicCounts[topic] = (topicCounts[topic] || 0) + 1;
      }
    }

    return { topics: topicCounts, allTopics };
  }

  /**
   * Gets unique topics from multiple outputs.
   *
   * @param outputs - Array of LLM outputs
   * @param filterErrors - Whether to filter out error topics (default: true)
   * @returns Array of unique topics
   */
  getUniqueTopics(outputs: string[], filterErrors: boolean = true): string[] {
    const { allTopics } = this.analyzeDistribution(outputs);
    // Use Array.from instead of spread for better compatibility
    const unique = Array.from(new Set(allTopics));

    if (filterErrors) {
      return unique.filter(
        t =>
          !t.includes('Error') &&
          !t.includes('error') &&
          !t.includes('timeout') &&
          !t.includes('Unknown')
      );
    }

    return unique;
  }

  /**
   * Clears the topic cache.
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Gets current cache size.
   */
  getCacheSize(): number {
    return this.cache.size;
  }
}

/**
 * Creates a topic list requirement string for LLM prompts.
 *
 * @param topics - Array of topics
 * @returns Formatted string for prompt injection
 *
 * @example
 * ```typescript
 * const topics = ['AI', 'ML', 'Neural Networks'];
 * const requirement = createTopicRequirement(topics);
 * // Returns formatted string for LLM prompt
 * ```
 */
export function createTopicRequirement(topics: string[]): string {
  if (topics.length === 0) {
    return '';
  }

  const topicList = topics.map((t, i) => `${i + 1}. ${t}`).join('\n');

  return `
====================
EXPLICIT TOPIC COVERAGE REQUIREMENT
====================
You MUST create dedicated sections for EACH of the following ${topics.length} topics:
${topicList}

Each topic must receive approximately equal attention (${Math.round(100 / topics.length)}% of content each).
Do NOT combine topics or focus primarily on one.
====================
`;
}

/**
 * Extracts topics from a single output without caching (stateless function).
 *
 * @param output - LLM output containing structured topic information
 * @param config - Optional topic extraction configuration
 * @returns Array of extracted topics
 */
export function extractTopics(
  output: string,
  config?: TopicExtractionConfig
): string[] {
  const extractor = new TopicExtractor(config);
  return extractor.extractTopics(output);
}

/**
 * Analyzes topic distribution across multiple outputs (stateless function).
 *
 * @param outputs - Array of LLM outputs
 * @param config - Optional topic extraction configuration
 * @returns Object with topic counts and all unique topics
 */
export function analyzeTopicDistribution(
  outputs: string[],
  config?: TopicExtractionConfig
): { topics: Record<string, number>; allTopics: string[] } {
  const extractor = new TopicExtractor(config);
  return extractor.analyzeDistribution(outputs);
}

/**
 * Creates a balanced topic selection from multiple outputs.
 * Ensures diverse representation when selecting chunks for further processing.
 *
 * @param outputs - Array of LLM outputs
 * @param maxSelection - Maximum number of outputs to select
 * @param config - Optional topic extraction configuration
 * @returns Indices of selected outputs
 */
export function selectBalancedByTopic(
  outputs: string[],
  maxSelection: number,
  config?: TopicExtractionConfig
): number[] {
  const extractor = new TopicExtractor(config);
  const { topics, allTopics } = extractor.analyzeDistribution(outputs);

  // If we have fewer outputs than max selection, return all
  if (outputs.length <= maxSelection) {
    return outputs.map((_, i) => i);
  }

  // Group outputs by primary topic
  const topicGroups: Record<string, number[]> = {};
  for (let i = 0; i < outputs.length; i++) {
    const outputTopics = extractor.extractTopics(outputs[i]);
    const primaryTopic = outputTopics[0] || 'Unknown';
    if (!topicGroups[primaryTopic]) {
      topicGroups[primaryTopic] = [];
    }
    topicGroups[primaryTopic].push(i);
  }

  // Select outputs evenly across topics
  const selected: number[] = [];
  const topicKeys = Object.keys(topicGroups);
  let topicIndex = 0;

  while (selected.length < maxSelection && topicKeys.length > 0) {
    const topic = topicKeys[topicIndex % topicKeys.length];
    const group = topicGroups[topic];

    if (group.length > 0) {
      selected.push(group.shift()!);
    } else {
      // Remove exhausted topic
      topicKeys.splice(topicIndex % topicKeys.length, 1);
      topicIndex--;
    }

    topicIndex++;
  }

  return selected;
}
