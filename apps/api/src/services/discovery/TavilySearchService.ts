import { env } from '../../config/env.js';

/**
 * Source discovery result from Tavily
 */
export interface DiscoveredSource {
  title: string;
  url: string;
  snippet: string;
  score: number;
}

/**
 * Options for source discovery
 */
export interface DiscoveryOptions {
  query: string;
  scoreThreshold?: number;
  excludeDomains?: string[];
  maxResults?: number;
}

/**
 * TavilySearchService handles web source discovery using Tavily Search API
 * Optimized for AI/RAG workflows with relevance scoring
 */
export class TavilySearchService {
  private apiKey: string;
  private baseUrl = 'https://api.tavily.com/search';

  constructor() {
    this.apiKey = env.TAVILY_API_KEY;

    if (!this.apiKey) {
      throw new Error('TAVILY_API_KEY is not configured');
    }
  }

  /**
   * Search for relevant web sources based on query
   *
   * @param options - Search options including query and filters
   * @returns Array of discovered sources sorted by relevance score
   */
  async discoverSources(options: DiscoveryOptions): Promise<DiscoveredSource[]> {
    const {
      query,
      scoreThreshold = 0.5,
      excludeDomains = [],
      maxResults = 10,
    } = options;

    console.log(`[Tavily] Searching for sources: "${query}"`);

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          api_key: this.apiKey,
          query: query,
          search_depth: 'basic', // Use 'basic' for faster results, 'advanced' for deeper search
          include_answer: false,  // We only need sources, not AI-generated answers
          include_raw_content: false, // Content will be fetched later via Supadata
          max_results: maxResults,
          exclude_domains: excludeDomains.length > 0 ? excludeDomains : undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Tavily API error: ${response.status} - ${JSON.stringify(errorData)}`);
      }

      const data = await response.json() as { results?: any[] };

      // Extract and transform results
      let sources: DiscoveredSource[] = (data.results || []).map((result: any) => ({
        title: result.title || 'Untitled',
        url: result.url,
        snippet: result.content || '',
        score: result.score || 0,
      }));

      // Filter by score threshold
      sources = sources.filter(source => source.score >= scoreThreshold);

      // Sort by score (descending)
      sources.sort((a, b) => b.score - a.score);

      console.log(`[Tavily] Found ${sources.length} sources (threshold: ${scoreThreshold})`);

      return sources;

    } catch (error) {
      console.error('[Tavily] Search failed:', error);

      if (error instanceof Error) {
        throw new Error(`Source discovery failed: ${error.message}`);
      }

      throw new Error('Source discovery failed: Unknown error');
    }
  }
}
