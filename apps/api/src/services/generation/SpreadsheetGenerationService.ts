import { supabase } from '../../config/database.js';
import { SpreadsheetGraph, OverallStateType } from '../agents/SpreadsheetGraph.js';
import { env } from '../../config/env.js';
import { TitleGeneratorService } from '../processing/TitleGeneratorService.js';
import { createLangSmithRunConfig } from '../agents/shared/index.js';

export interface SpreadsheetGenerationParams {
  documentIds: string[];
  spreadsheetType: string;
  customPrompt?: string;
  onStatusUpdate?: (status: string) => void;
}

export interface SpreadsheetResult {
  content: string;
  metadata: {
    spreadsheetType: string;
    documentIds: string[];
    chunksProcessed: number;
  };
}

export interface SaveSpreadsheetParams {
  spreadsheetId: string;
  title: string;
  content: string;
  spreadsheetType: string;
  metadata: any;
}

export class SpreadsheetGenerationService {
  private spreadsheetGraph: SpreadsheetGraph;
  private titleGenerator: TitleGeneratorService;

  constructor() {
    this.spreadsheetGraph = new SpreadsheetGraph(
      env.TOGETHER_AI_API_KEY,
      env.FAST_LLM,
      env.SMART_LLM || env.FAST_LLM,
      parseInt(env.SPREADSHEET_MAX_TOKENS || '64000', 10)
    );
    this.titleGenerator = new TitleGeneratorService(env.TOGETHER_AI_API_KEY, env.FAST_LLM);
  }

  async generateSpreadsheet(params: SpreadsheetGenerationParams): Promise<SpreadsheetResult> {
    const { documentIds, spreadsheetType, customPrompt, onStatusUpdate } = params;

    try {
      // Update status
      onStatusUpdate?.('generating');

      // Fetch chunks from selected documents
      const chunks = await this.fetchChunks(documentIds);

      if (chunks.length === 0) {
        throw new Error('No content found in selected documents');
      }

      console.log(
        `[SpreadsheetGeneration] Processing ${chunks.length} chunks for ${spreadsheetType} spreadsheet`
      );

      // Build and invoke graph
      const graph = this.spreadsheetGraph.buildGraph();
      const traceConfig = createLangSmithRunConfig({
        runName: 'SpreadsheetGraph',
        tags: ['agent', 'spreadsheet'],
        metadata: {
          documentIds,
          spreadsheetType,
          customPrompt,
          chunksCount: chunks.length,
        },
      });
      const result = await graph.invoke({
        documentIds,
        chunks,
        spreadsheetType,
        customPrompt,
        mapOutputs: [],
        collapsedOutputs: [],
        finalOutput: '',
        status: 'generating',
      }, traceConfig) as unknown as OverallStateType;

      console.log(
        `[SpreadsheetGeneration] Spreadsheet generation completed. Status: ${result.status}`
      );

      return {
        content: result.finalOutput || '',
        metadata: {
          spreadsheetType,
          documentIds,
          chunksProcessed: chunks.length,
        },
      };
    } catch (error) {
      console.error('[SpreadsheetGeneration] Error generating spreadsheet:', error);
      throw error;
    }
  }

  async fetchChunks(documentIds: string[]): Promise<string[]> {
    try {
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        service: 'SpreadsheetGeneration',
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
          console.error('[SpreadsheetGeneration] Error fetching chunks:', error);
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
        service: 'SpreadsheetGeneration',
        action: 'fetch_chunks_complete',
        totalChunks: chunks.length,
        nonEmptyChunks: nonEmptyChunks.length,
        emptyChunksFiltered: chunks.length - nonEmptyChunks.length,
      }));

      // Debug: Log first chunk preview
      if (nonEmptyChunks.length > 0) {
        const firstChunkPreview = nonEmptyChunks[0]?.substring(0, 200) || 'EMPTY';
        console.log(`[SpreadsheetGeneration] First chunk preview (${nonEmptyChunks[0]?.length || 0} chars): ${firstChunkPreview}...`);
      } else {
        console.warn('[SpreadsheetGeneration] WARNING: No chunks found!');
      }

      return nonEmptyChunks;
    } catch (error) {
      console.error('[SpreadsheetGeneration] Error in fetchChunks:', error);
      throw error;
    }
  }

  async saveSpreadsheet(params: SaveSpreadsheetParams): Promise<void> {
    try {
      const { error } = await supabase
        .from('spreadsheets')
        .update({
          title: params.title,
          data: {
            content: params.content,
          },
          status: 'completed',
          metadata: params.metadata,
          updated_at: new Date().toISOString(),
        })
        .eq('id', params.spreadsheetId);

      if (error) {
        console.error('[SpreadsheetGeneration] Error saving spreadsheet:', error);
        throw new Error(`Failed to save spreadsheet: ${error.message}`);
      }

      console.log(`[SpreadsheetGeneration] Spreadsheet saved to ${params.spreadsheetId}`);
    } catch (error) {
      console.error('[SpreadsheetGeneration] Error in saveSpreadsheet:', error);
      throw error;
    }
  }

  async updateSpreadsheetStatus(
    spreadsheetId: string,
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
        .from('spreadsheets')
        .update(updateData)
        .eq('id', spreadsheetId);

      if (error) {
        console.error('[SpreadsheetGeneration] Error updating status:', error);
        throw new Error(`Failed to update status: ${error.message}`);
      }
    } catch (error) {
      console.error('[SpreadsheetGeneration] Error in updateSpreadsheetStatus:', error);
      throw error;
    }
  }

  getSpreadsheetTitle(spreadsheetType: string): string {
    const titles: Record<string, string> = {
      data_extraction: 'Data Extraction Table',
      comparison_table: 'Comparison Table',
      timeline: 'Timeline',
      financial_summary: 'Financial Summary',
      custom: 'Custom Spreadsheet',
    };
    return titles[spreadsheetType] || 'Spreadsheet';
  }

  getPreviewText(spreadsheetType: string, status: string, metadata?: any): string {
    const phase = metadata?.phase || status;
    const isGenerating = status === 'generating' ||
      phase === 'generating' ||
      phase === 'mapping' ||
      phase === 'collapsing' ||
      phase === 'reducing';

    if (isGenerating) {
      return 'Spreadsheet • Generating...';
    }
    if (status === 'failed' || phase === 'failed') {
      return 'Spreadsheet • Failed';
    }
    return `Spreadsheet • ${this.getSpreadsheetTitle(spreadsheetType)}`;
  }

  /**
   * Generate an AI-powered title from spreadsheet content
   */
  async generateTitleFromContent(content: string): Promise<string> {
    try {
      const contentChunk = content.substring(0, 500);
      const title = await this.titleGenerator.generateTitle(contentChunk);
      console.log(`[SpreadsheetGeneration] Generated title: ${title}`);
      return title;
    } catch (error) {
      console.error('[SpreadsheetGeneration] Error generating title from content:', error);
      return 'Spreadsheet';
    }
  }

  /**
   * Generate a fallback title from source chunks
   */
  async generateTitleFromChunks(chunks: string[], spreadsheetType: string): Promise<string> {
    try {
      const title = await this.titleGenerator.generateTitle(chunks[0] || 'No content');
      console.log(`[SpreadsheetGeneration] Generated title from chunks: ${title}`);
      return title;
    } catch (error) {
      console.error('[SpreadsheetGeneration] Error generating title from chunks:', error);
      return this.getSpreadsheetTitle(spreadsheetType);
    }
  }
}
