import { supabase } from '../../config/database.js';
import { MindMapGraph, OverallStateType, packChunks } from '../agents/MindMapGraph.js';
import { env } from '../../config/env.js';
import { TitleGeneratorService } from '../processing/TitleGeneratorService.js';

export interface MindMapGenerationParams {
  documentIds: string[];
  onStatusUpdate?: (status: string) => void;
}

export interface MindMapResult {
  data: any;
  metadata: {
    documentIds: string[];
    chunksProcessed: number;
  };
}

export interface SaveMindMapParams {
  mindmapId: string;
  title: string;
  data: any;
  metadata: any;
}

export class MindMapGenerationService {
  private mindMapGraph: MindMapGraph;
  private titleGenerator: TitleGeneratorService;

  constructor() {
    this.mindMapGraph = new MindMapGraph(
      env.TOGETHER_AI_API_KEY,
      env.FAST_LLM,
      env.SMART_LLM || env.FAST_LLM // Use smart model if set, otherwise fall back to fast model
    );
    this.titleGenerator = new TitleGeneratorService(env.TOGETHER_AI_API_KEY, env.FAST_LLM);
  }

  async generateMindMap(params: MindMapGenerationParams): Promise<MindMapResult> {
    const { documentIds, onStatusUpdate } = params;

    console.log(`\n[MindMapGeneration] ===== GENERATE MIND MAP START =====`);
    console.log(`[MindMapGeneration] Document IDs: ${documentIds.join(', ')}`);

    try {
      // Update status
      onStatusUpdate?.('generating');

      // Fetch chunks from selected documents
      const rawChunks = await this.fetchChunks(documentIds);

      if (rawChunks.length === 0) {
        throw new Error('No content found in selected documents');
      }

      console.log(
        `[MindMapGeneration] Fetched ${rawChunks.length} raw chunks for mind map`
      );

      console.log(`\n[MindMapGeneration] ===== BUILDING GRAPH =====`);
      // Build and invoke graph
      const graph = this.mindMapGraph.buildGraph();
      console.log(`[MindMapGeneration] Graph built successfully`);

      console.log(`\n[MindMapGeneration] ===== INVOKING GRAPH =====`);
      console.log(`[MindMapGeneration] Input chunks: ${rawChunks.length}`);
      console.log(`[MindMapGeneration] Recursion limit: 50`);

      const invokeStart = Date.now();
      const result = await graph.invoke(
        {
          allChunks: rawChunks,
        },
        {
          // Increase recursion limit to handle more batches safely
          recursionLimit: 50,
        }
      ) as unknown as OverallStateType;

      const invokeElapsed = Date.now() - invokeStart;
      console.log(`\n[MindMapGeneration] ===== GRAPH COMPLETED =====`);
      console.log(`[MindMapGeneration] Total time: ${invokeElapsed}ms`);
      console.log(`[MindMapGeneration] Status: ${result.status}`);
      console.log(`[MindMapGeneration] Has finalOutput: ${result.finalOutput !== null}`);
      console.log(`[MindMapGeneration] Extracted concepts count: ${result.extractedConcepts?.length || 0}`);

      if (result.finalOutput) {
        console.log(`[MindMapGeneration] Final output keys: ${Object.keys(result.finalOutput)}`);
        console.log(`[MindMapGeneration] Has nodeData: ${result.finalOutput.nodeData !== null}`);
        if (result.finalOutput.nodeData) {
          console.log(`[MindMapGeneration] Root topic: "${result.finalOutput.nodeData?.topic || 'NO TOPIC'}"`);
          console.log(`[MindMapGeneration] Children count: ${result.finalOutput.nodeData?.children?.length || 0}`);
        }
      }

      return {
        data: result.finalOutput,
        metadata: {
          documentIds,
          chunksProcessed: rawChunks.length,
        },
      };
    } catch (error) {
      console.error(`\n[MindMapGeneration] ===== GENERATE MIND MAP ERROR =====`);
      console.error(`[MindMapGeneration] Error type: ${error instanceof Error ? error.constructor.name : typeof error}`);
      console.error(`[MindMapGeneration] Error message: ${error instanceof Error ? error.message : 'Unknown'}`);

      if (error instanceof Error) {
        console.error(`[MindMapGeneration] Error name: ${error.name}`);
        console.error(`[MindMapGeneration] Error stack: ${error.stack?.slice(0, 500)}`);
      }

      const errorAny = error as any;
      if (errorAny.response) {
        console.error(`[MindMapGeneration] Response status: ${errorAny.response.status}`);
        console.error(`[MindMapGeneration] Response data: ${JSON.stringify(errorAny.response.data).slice(0, 500)}`);
      }
      if (errorAny.statusCode) {
        console.error(`[MindMapGeneration] Status code: ${errorAny.statusCode}`);
      }
      if (errorAny.cause) {
        console.error(`[MindMapGeneration] Error cause: ${errorAny.cause}`);
      }

      console.error(`[MindMapGeneration] Full error object:`, JSON.stringify(error, Object.getOwnPropertyNames(error), 2)?.slice(0, 1000));

      throw error;
    }
  }

  async fetchChunks(documentIds: string[]): Promise<string[]> {
    try {
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        service: 'MindMapGeneration',
        action: 'fetch_chunks',
        documentIds,
      }));

      const chunks: string[] = [];
      const batchSize = 100;
      let offset = 0;
      let hasMore = true;
      const MAX_CHUNKS = 500; // Memory safety limit

      while (hasMore) {
        // Memory safety check: prevent loading too many chunks into memory
        if (chunks.length >= MAX_CHUNKS) {
          console.warn(`[MindMapGeneration] Chunk limit reached (${MAX_CHUNKS}), truncating to prevent memory overflow`);
          break;
        }

        const { data, error } = await supabase
          .from('document_chunks')
          .select('content, document_id, chunk_index')
          .in('document_id', documentIds)
          .order('document_id', { ascending: true })
          .order('chunk_index', { ascending: true })
          .range(offset, offset + batchSize - 1);

        if (error) {
          console.error('[MindMapGeneration] Error fetching chunks:', error);
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
        service: 'MindMapGeneration',
        action: 'fetch_chunks_complete',
        totalChunks: chunks.length,
        nonEmptyChunks: nonEmptyChunks.length,
        emptyChunksFiltered: chunks.length - nonEmptyChunks.length,
      }));

      // Debug: Log first chunk preview to verify content
      if (nonEmptyChunks.length > 0) {
        const firstChunkPreview = nonEmptyChunks[0]?.substring(0, 200) || 'EMPTY';
        console.log(`[MindMapGeneration] First chunk preview (${nonEmptyChunks[0]?.length || 0} chars): ${firstChunkPreview}...`);
      } else {
        console.warn('[MindMapGeneration] WARNING: No chunks found!');
      }

      return nonEmptyChunks;
    } catch (error) {
      console.error('[MindMapGeneration] Error in fetchChunks:', error);
      throw error;
    }
  }

  async saveMindMap(params: SaveMindMapParams): Promise<void> {
    try {
      const { error } = await supabase
        .from('mindmaps')
        .update({
          title: params.title,
          data: params.data,
          status: 'completed',
          metadata: params.metadata,
          updated_at: new Date().toISOString(),
        })
        .eq('id', params.mindmapId);

      if (error) {
        console.error('[MindMapGeneration] Error saving mind map:', error);
        throw new Error(`Failed to save mind map: ${error.message}`);
      }

      console.log(`[MindMapGeneration] Mind map saved: ${params.mindmapId}`);
    } catch (error) {
      console.error('[MindMapGeneration] Error in saveMindMap:', error);
      throw error;
    }
  }

  async updateMindMapStatus(
    mindMapId: string,
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
        .from('mindmaps')
        .update(updateData)
        .eq('id', mindMapId);

      if (error) {
        console.error('[MindMapGeneration] Error updating status:', error);
        throw new Error(`Failed to update status: ${error.message}`);
      }
    } catch (error) {
      console.error('[MindMapGeneration] Error in updateMindMapStatus:', error);
      throw error;
    }
  }

  getMindMapTitle(): string {
    return 'Mind Map';
  }

  getMindMapSubtitle(status: string, metadata?: any): string {
    // Check if generating (either via status field or metadata.phase)
    const phase = metadata?.phase || status;
    const isGenerating = status === 'generating' ||
      phase === 'generating' ||
      phase === 'mapping' ||
      phase === 'collapsing' ||
      phase === 'reducing';

    if (isGenerating) {
      return 'Mind Map • Generating...';
    }
    if (status === 'failed' || phase === 'failed') {
      return 'Mind Map • Failed';
    }
    return `Mind Map • Visual Overview`;
  }

  /**
   * Generate an AI-powered title from mind map content
   * Uses the root node topic to generate a descriptive title
   */
  async generateTitleFromContent(data: any): Promise<string> {
    try {
      // Extract root topic from mind map data
      const rootTopic = data?.nodeData?.topic || '';
      if (rootTopic) {
        console.log(`[MindMapGeneration] Using root topic as title: ${rootTopic}`);
        return rootTopic;
      }

      // Fallback: use first chunk to generate title
      const title = await this.titleGenerator.generateTitle('Mind map from documents');
      console.log(`[MindMapGeneration] Generated fallback title: ${title}`);
      return title;
    } catch (error) {
      console.error('[MindMapGeneration] Error generating title from content:', error);
      // Fallback to a default title if generation fails
      return 'Mind Map';
    }
  }

  /**
   * Generate a fallback title from source chunks (when content is empty)
   */
  async generateTitleFromChunks(chunks: string[]): Promise<string> {
    try {
      // Use the first chunk for title generation
      const title = await this.titleGenerator.generateTitle(chunks[0] || 'No content');
      console.log(`[MindMapGeneration] Generated title from chunks: ${title}`);
      return title;
    } catch (error) {
      console.error('[MindMapGeneration] Error generating title from chunks:', error);
      // Fallback to default title if generation fails
      return this.getMindMapTitle();
    }
  }
}
