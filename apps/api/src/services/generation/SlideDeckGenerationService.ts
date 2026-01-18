import { supabase } from '../../config/database.js';
import { SlideDeckGraph, OverallStateType, Slide } from '../agents/SlideDeckGraph.js';
import { env } from '../../config/env.js';
import { createLangSmithRunConfig } from '../agents/shared/index.js';

export interface SlideDeckGenerationParams {
  documentIds: string[];
  slideType: 'detailed_deck' | 'presenter_slides';
  deckLength: 'short' | 'default';
  customPrompt?: string;
  onStatusUpdate?: (status: string) => void;
}

export interface SlideDeckResult {
  slides: Slide[];
  metadata: {
    documentIds: string[];
    chunksProcessed: number;
    slideType: 'detailed_deck' | 'presenter_slides';
    deckLength: 'short' | 'default';
    customPrompt?: string;
  };
}

export interface SaveSlideDeckParams {
  slideDeckId: string;
  title: string;
  slides: Slide[];
  metadata: any;
}

export class SlideDeckGenerationService {
  private slideDeckGraph: SlideDeckGraph;

  constructor() {
    // Use FAST_LLM for map phase, SMART_LLM for reduce phases
    const smartModel = env.SMART_LLM || env.FAST_LLM; // Fallback to FAST_LLM if SMART_LLM not configured
    
    this.slideDeckGraph = new SlideDeckGraph(
      env.TOGETHER_AI_API_KEY,
      env.FAST_LLM,      // Fast model for map phase (extracting concepts)
      smartModel,         // Smart model for reduce phases (selection, refinement)
      env.ZHIPUAI_API_KEY,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    console.log(`[SlideDeckGenerationService] Using FAST_LLM: ${env.FAST_LLM}, SMART_LLM: ${smartModel}`);
  }

  async generateSlideDeck(params: SlideDeckGenerationParams): Promise<SlideDeckResult> {
    const { documentIds, slideType, deckLength, customPrompt, onStatusUpdate } = params;

    try {
      onStatusUpdate?.('generating');

      const chunks = await this.fetchChunks(documentIds);

      if (chunks.length === 0) {
        throw new Error('No content found in selected documents');
      }

      console.log(
        `[SlideDeckGeneration] Processing ${chunks.length} chunks for ${deckLength} ${slideType} slide deck`
      );

      const graph = this.slideDeckGraph.buildGraph();
      const traceConfig = createLangSmithRunConfig({
        runName: 'SlideDeckGraph',
        tags: ['agent', 'slides'],
        metadata: {
          documentIds,
          slideType,
          deckLength,
          customPrompt,
          chunksCount: chunks.length,
        },
      });

      const result = await graph.invoke({
        documentIds,
        chunks,
        slideType,
        deckLength,
        customPrompt,
        title: 'Untitled Presentation',
        mapOutputs: [],
        collapsedOutputs: [],
        finalOutput: [],
        status: 'generating',
        onStatusUpdate: onStatusUpdate || undefined,
      }, traceConfig) as unknown as OverallStateType;

      console.log(
        `[SlideDeckGeneration] Slide deck generation completed. Status: ${result.status}, Slides: ${result.finalOutput.length}`
      );

      return {
        slides: result.finalOutput || [],
        metadata: {
          documentIds,
          chunksProcessed: chunks.length,
          slideType,
          deckLength,
          customPrompt,
        },
      };
    } catch (error) {
      console.error('[SlideDeckGeneration] Error generating slide deck:', error);
      throw error;
    }
  }

  async fetchChunks(documentIds: string[]): Promise<string[]> {
    try {
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        service: 'SlideDeckGeneration',
        action: 'fetch_chunks',
        documentIds,
      }));

      const chunks: string[] = [];
      const batchSize = 100;
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('document_chunks')
          .select('content, document_id, chunk_index')
          .in('document_id', documentIds)
          .order('document_id', { ascending: true })
          .order('chunk_index', { ascending: true })
          .range(offset, offset + batchSize - 1);

        if (error) {
          console.error('[SlideDeckGeneration] Error fetching chunks:', error);
          throw new Error(`Failed to fetch chunks: ${error.message}`);
        }

        if (!data || data.length === 0) {
          hasMore = false;
        } else {
          chunks.push(...data.map((d) => d.content));
          if (data.length < batchSize) {
            hasMore = false;
          } else {
            offset += batchSize;
          }
        }
      }

      const nonEmptyChunks = chunks.filter(c => c && c.trim().length > 0);

      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        service: 'SlideDeckGeneration',
        action: 'fetch_chunks_complete',
        totalChunks: chunks.length,
        nonEmptyChunks: nonEmptyChunks.length,
        emptyChunksFiltered: chunks.length - nonEmptyChunks.length,
      }));

      if (nonEmptyChunks.length > 0) {
        const firstChunkPreview = nonEmptyChunks[0]?.substring(0, 200) || 'EMPTY';
        console.log(`[SlideDeckGeneration] First chunk preview (${nonEmptyChunks[0]?.length || 0} chars): ${firstChunkPreview}...`);
      } else {
        console.warn('[SlideDeckGeneration] WARNING: No chunks found!');
      }

      return nonEmptyChunks;
    } catch (error) {
      console.error('[SlideDeckGeneration] Error in fetchChunks:', error);
      throw error;
    }
  }

  async saveSlideDeck(params: SaveSlideDeckParams): Promise<void> {
    try {
      // Format slides data for database storage
      const slidesData = params.slides.map(slide => ({
        slide_number: slide.slideNumber,
        slide_url: slide.imageUrl || '',
        title: slide.title,
        talking_points: slide.talkingPoints,
        prompt: slide.prompt,
        metadata: slide.metadata || {},
      }));

      const { error } = await supabase
        .from('slide_decks')
        .update({
          title: params.title,
          slides_data: slidesData,
          status: 'completed',
          metadata: params.metadata,
          updated_at: new Date().toISOString(),
        })
        .eq('id', params.slideDeckId);

      if (error) {
        console.error('[SlideDeckGeneration] Error saving slide deck:', error);
        throw new Error(`Failed to save slide deck: ${error.message}`);
      }

      console.log(`[SlideDeckGeneration] Slide deck saved to ${params.slideDeckId}`);
    } catch (error) {
      console.error('[SlideDeckGeneration] Error in saveSlideDeck:', error);
      throw error;
    }
  }

  async updateSlideDeckStatus(
    slideDeckId: string,
    status: string,
    metadata?: any
  ): Promise<void> {
    try {
      const updateData: any = {
        status,
        updated_at: new Date().toISOString(),
      };

      if (metadata) {
        updateData.metadata = metadata;
      }

      const { error } = await supabase
        .from('slide_decks')
        .update(updateData)
        .eq('id', slideDeckId);

      if (error) {
        console.error('[SlideDeckGeneration] Error updating status:', error);
        throw new Error(`Failed to update status: ${error.message}`);
      }
    } catch (error) {
      console.error('[SlideDeckGeneration] Error in updateSlideDeckStatus:', error);
      throw error;
    }
  }

  getSlideDeckTitle(slideType: 'detailed_deck' | 'presenter_slides', customPrompt?: string): string {
    if (customPrompt && customPrompt.trim().length > 0) {
      return `Slide Deck: ${customPrompt.trim()}`;
    }
    const typeLabel = slideType === 'detailed_deck' ? 'Detailed Deck' : 'Presenter Slides';
    return `${typeLabel}`;
  }

  getPreviewText(status: string, metadata?: any): string {
    const phase = metadata?.phase || status;
    const isGenerating = status === 'generating' ||
      phase === 'generating' ||
      phase === 'mapping' ||
      phase === 'collapsing' ||
      phase === 'reducing';

    const slideType = metadata?.slideType || 'detailed_deck';
    const deckLength = metadata?.deckLength || 'default';
    const typeLabel = slideType === 'detailed_deck' ? 'Detailed' : 'Presenter';
    const lengthLabel = deckLength === 'short' ? 'Short' : 'Standard';

    if (isGenerating) {
      return `${typeLabel} • ${lengthLabel} • Generating...`;
    }
    if (status === 'failed' || phase === 'failed') {
      return `Slide Deck • Failed`;
    }
    return `${typeLabel} • ${lengthLabel}`;
  }

  async generateTitleFromSlides(slides: Slide[]): Promise<string> {
    try {
      if (slides.length === 0) {
        return 'Slide Deck';
      }

      // Use the first slide's title as a base, or generate a descriptive title
      const topics = slides.slice(0, 5).map(s => s.title).filter(t => t && t.trim().length > 0);
      if (topics.length === 0) {
        return 'Slide Deck';
      }

      // For now, use a simple approach - can be enhanced with LLM later
      const mainTopic = topics[0];
      const title = slides.length > 1
        ? `${mainTopic} & More`
        : mainTopic;

      console.log(`[SlideDeckGeneration] Generated title: "${title}"`);
      return title.trim().length > 0 ? title : 'Slide Deck';
    } catch (error) {
      console.error('[SlideDeckGeneration] Error generating title from slides:', error);
      return 'Slide Deck';
    }
  }

  async generateTitleFromChunks(chunks: string[]): Promise<string> {
    try {
      if (chunks.length === 0) {
        return 'Slide Deck';
      }

      // Simple extraction of first meaningful content as title
      const firstChunk = chunks[0] || '';
      const sentences = firstChunk.split(/[.!?]+/).filter(s => s.trim().length > 0);

      if (sentences.length > 0) {
        const title = sentences[0].trim().substring(0, 100);
        console.log(`[SlideDeckGeneration] Generated title from chunks: ${title}`);
        return title.length > 0 ? title : 'Slide Deck';
      }

      return 'Slide Deck';
    } catch (error) {
      console.error('[SlideDeckGeneration] Error generating title from chunks:', error);
      return this.getSlideDeckTitle('detailed_deck');
    }
  }
}
