import { supabase } from '../../config/database.js';
import { FlashcardGraph, OverallStateType, Flashcard } from '../agents/FlashcardGraph.js';
import { env } from '../../config/env.js';
import { TitleGeneratorService } from '../processing/TitleGeneratorService.js';

export interface FlashcardGenerationParams {
  documentIds: string[];
  cardCount: number; // 20 (fewer), 35 (standard), or 55 (more) - midpoint of ranges
  difficulty: string; // 'easy', 'medium', 'hard'
  topic?: string;
  onStatusUpdate?: (status: string) => void;
}

export interface FlashcardResult {
  flashcards: Flashcard[];
  metadata: {
    documentIds: string[];
    chunksProcessed: number;
    cardCount: number;
    difficulty: string;
    topic?: string;
  };
}

export interface SaveFlashcardParams {
  flashcardId: string;
  title: string;
  flashcards: Flashcard[];
  metadata: any;
}

export class FlashcardGenerationService {
  private flashcardGraph: FlashcardGraph;
  private titleGenerator: TitleGeneratorService;

  constructor() {
    this.flashcardGraph = new FlashcardGraph(
      env.TOGETHER_AI_API_KEY,
      env.FAST_LLM,
      env.SMART_LLM || env.FAST_LLM, // Use smart model for reduce, fall back to fast if not set
      parseInt(env.REPORT_MAX_TOKENS || '24000', 10)
    );
    this.titleGenerator = new TitleGeneratorService(env.TOGETHER_AI_API_KEY, env.FAST_LLM);
  }

  async generateFlashcards(params: FlashcardGenerationParams): Promise<FlashcardResult> {
    const { documentIds, cardCount, difficulty, topic, onStatusUpdate } = params;

    try {
      // Update status
      onStatusUpdate?.('generating');

      // Fetch chunks from selected documents
      const chunks = await this.fetchChunks(documentIds);

      if (chunks.length === 0) {
        throw new Error('No content found in selected documents');
      }

      console.log(
        `[FlashcardGeneration] Processing ${chunks.length} chunks for ${cardCount} ${difficulty} flashcards`
      );

      // Build and invoke graph
      const graph = this.flashcardGraph.buildGraph();
      const result = await graph.invoke({
        documentIds,
        chunks,
        cardCount,
        difficulty,
        topic,
        mapOutputs: [],
        collapsedOutputs: [],
        finalOutput: [],
        status: 'generating',
      }) as unknown as OverallStateType;

      console.log(
        `[FlashcardGeneration] Flashcard generation completed. Status: ${result.status}, Cards: ${result.finalOutput.length}`
      );

      return {
        flashcards: result.finalOutput || [],
        metadata: {
          documentIds,
          chunksProcessed: chunks.length,
          cardCount,
          difficulty,
          topic,
        },
      };
    } catch (error) {
      console.error('[FlashcardGeneration] Error generating flashcards:', error);
      throw error;
    }
  }

  async fetchChunks(documentIds: string[]): Promise<string[]> {
    try {
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        service: 'FlashcardGeneration',
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
          console.error('[FlashcardGeneration] Error fetching chunks:', error);
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

      // Filter out empty chunks
      const nonEmptyChunks = chunks.filter(c => c && c.trim().length > 0);

      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        service: 'FlashcardGeneration',
        action: 'fetch_chunks_complete',
        totalChunks: chunks.length,
        nonEmptyChunks: nonEmptyChunks.length,
        emptyChunksFiltered: chunks.length - nonEmptyChunks.length,
      }));

      // Debug: Log first chunk preview to verify content
      if (nonEmptyChunks.length > 0) {
        const firstChunkPreview = nonEmptyChunks[0]?.substring(0, 200) || 'EMPTY';
        console.log(`[FlashcardGeneration] First chunk preview (${nonEmptyChunks[0]?.length || 0} chars): ${firstChunkPreview}...`);
      } else {
        console.warn('[FlashcardGeneration] WARNING: No chunks found!');
      }

      return nonEmptyChunks;
    } catch (error) {
      console.error('[FlashcardGeneration] Error in fetchChunks:', error);
      throw error;
    }
  }

  async saveFlashcards(params: SaveFlashcardParams): Promise<void> {
    try {
      const { error } = await supabase
        .from('flashcards')
        .update({
          title: params.title,
          cards_data: JSON.stringify(params.flashcards),
          status: 'completed',
          metadata: params.metadata,
          updated_at: new Date().toISOString(),
        })
        .eq('id', params.flashcardId);

      if (error) {
        console.error('[FlashcardGeneration] Error saving flashcards:', error);
        throw new Error(`Failed to save flashcards: ${error.message}`);
      }

      console.log(`[FlashcardGeneration] Flashcards saved to flashcard ${params.flashcardId}`);
    } catch (error) {
      console.error('[FlashcardGeneration] Error in saveFlashcards:', error);
      throw error;
    }
  }

  async updateFlashcardStatus(
    flashcardId: string,
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
        .from('flashcards')
        .update(updateData)
        .eq('id', flashcardId);

      if (error) {
        console.error('[FlashcardGeneration] Error updating status:', error);
        throw new Error(`Failed to update status: ${error.message}`);
      }
    } catch (error) {
      console.error('[FlashcardGeneration] Error in updateFlashcardStatus:', error);
      throw error;
    }
  }

  getFlashcardTitle(topic?: string): string {
    if (topic && topic.trim().length > 0) {
      return `Flashcards: ${topic.trim()}`;
    }
    return 'Flashcards';
  }

  getPreviewText(status: string, metadata?: any): string {
    // Check if generating (either via status field or metadata.phase)
    const phase = metadata?.phase || status;
    const isGenerating = status === 'generating' ||
      phase === 'generating' ||
      phase === 'mapping' ||
      phase === 'collapsing' ||
      phase === 'reducing';

    if (isGenerating) {
      const cardCount = metadata?.cardCount || 'standard';
      const difficulty = metadata?.difficulty || 'medium';
      return `${this.getCardCountLabel(cardCount)} Cards • ${difficulty} • Generating...`;
    }
    if (status === 'failed' || phase === 'failed') {
      return 'Flashcards • Failed';
    }
    const cardCount = metadata?.cardCount || 'standard';
    const difficulty = metadata?.difficulty || 'medium';
    return `${this.getCardCountLabel(cardCount)} Cards • ${difficulty}`;
  }

  private getCardCountLabel(count: string | number): string {
    if (typeof count === 'string') {
      const labels: Record<string, string> = {
        fewer: '20',
        standard: '35',
        more: '55',
      };
      return labels[count] || '35';
    }
    return String(count);
  }

  /**
   * Generate an AI-powered title from flashcard content
   * Uses the first few flashcards to generate a descriptive title
   */
  async generateTitleFromFlashcards(flashcards: Flashcard[]): Promise<string> {
    try {
      if (flashcards.length === 0) {
        return 'Flashcards';
      }

      // Use first 3-5 flashcard fronts to generate title
      const sampleContent = flashcards
        .slice(0, 5)
        .map((f) => f.front)
        .filter(f => f && f.trim().length > 0)
        .join('; ');

      // If all fronts are empty, return fallback
      if (!sampleContent || sampleContent.trim().length === 0) {
        console.warn('[FlashcardGeneration] No valid flashcard content for title generation');
        return 'Flashcards';
      }

      const title = await this.titleGenerator.generateTitle(sampleContent);
      const trimmedTitle = title.trim();
      console.log(`[FlashcardGeneration] Generated title: "${trimmedTitle}"`);
      return trimmedTitle.length > 0 ? trimmedTitle : 'Flashcards';
    } catch (error) {
      console.error('[FlashcardGeneration] Error generating title from flashcards:', error);
      // Fallback to a default title if generation fails
      return 'Flashcards';
    }
  }

  /**
   * Generate a fallback title from source chunks (when flashcards are empty)
   * Mirrors the pattern used in ReportGenerationService and MindMapGenerationService
   */
  async generateTitleFromChunks(chunks: string[]): Promise<string> {
    try {
      if (chunks.length === 0) {
        return 'Flashcards';
      }

      // Use the first chunk for title generation
      const title = await this.titleGenerator.generateTitle(chunks[0] || 'No content');
      console.log(`[FlashcardGeneration] Generated title from chunks: ${title}`);
      return title;
    } catch (error) {
      console.error('[FlashcardGeneration] Error generating title from chunks:', error);
      // Fallback to default title if generation fails
      return this.getFlashcardTitle();
    }
  }
}
