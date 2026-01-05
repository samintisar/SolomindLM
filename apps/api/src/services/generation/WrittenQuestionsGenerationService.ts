import { supabase } from '../../config/database.js';
import { WrittenQuestionsGraph, OverallStateType, WrittenQuestion } from '../agents/WrittenQuestionsGraph.js';
import { env } from '../../config/env.js';
import { TitleGeneratorService } from '../processing/TitleGeneratorService.js';

export interface WrittenQuestionsGenerationParams {
  documentIds: string[];
  questionCount: number;
  difficulty: string;
  questionType: string;
  focus?: string;
  onStatusUpdate?: (status: string) => void;
}

export interface WrittenQuestionsResult {
  questions: WrittenQuestion[];
  metadata: {
    documentIds: string[];
    chunksProcessed: number;
    questionCount: number;
    difficulty: string;
    questionType: string;
    focus?: string;
  };
}

export interface SaveWrittenQuestionsParams {
  writtenQuestionsId: string;
  title: string;
  questions: WrittenQuestion[];
  metadata: any;
}

export class WrittenQuestionsGenerationService {
  private writtenQuestionsGraph: WrittenQuestionsGraph;
  private titleGenerator: TitleGeneratorService;

  constructor() {
    this.writtenQuestionsGraph = new WrittenQuestionsGraph(
      env.TOGETHER_AI_API_KEY,
      env.FAST_LLM,
      env.SMART_LLM || env.FAST_LLM
    );
    this.titleGenerator = new TitleGeneratorService(env.TOGETHER_AI_API_KEY, env.FAST_LLM);
  }

  async generateWrittenQuestions(params: WrittenQuestionsGenerationParams): Promise<WrittenQuestionsResult> {
    const { documentIds, questionCount, difficulty, questionType, focus, onStatusUpdate } = params;

    try {
      onStatusUpdate?.('generating');

      const chunks = await this.fetchChunks(documentIds);

      if (chunks.length === 0) {
        throw new Error('No content found in selected documents');
      }

      console.log(
        `[WrittenQuestionsGeneration] Processing ${chunks.length} chunks for ${questionCount} ${difficulty} ${questionType} questions`
      );

      const graph = this.writtenQuestionsGraph.buildGraph();
      const result = await graph.invoke({
        documentIds,
        chunks,
        questionCount,
        difficulty,
        questionType,
        focus,
        mapOutputs: [],
        collapsedOutputs: [],
        finalOutput: [],
        status: 'generating',
      }) as unknown as OverallStateType;

      console.log(
        `[WrittenQuestionsGeneration] Written questions generation completed. Status: ${result.status}, Questions: ${result.finalOutput.length}`
      );

      return {
        questions: result.finalOutput || [],
        metadata: {
          documentIds,
          chunksProcessed: chunks.length,
          questionCount,
          difficulty,
          questionType,
          focus,
        },
      };
    } catch (error) {
      console.error('[WrittenQuestionsGeneration] Error generating written questions:', error);
      throw error;
    }
  }

  async fetchChunks(documentIds: string[]): Promise<string[]> {
    try {
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        service: 'WrittenQuestionsGeneration',
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
          console.error('[WrittenQuestionsGeneration] Error fetching chunks:', error);
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
        service: 'WrittenQuestionsGeneration',
        action: 'fetch_chunks_complete',
        totalChunks: chunks.length,
        nonEmptyChunks: nonEmptyChunks.length,
        emptyChunksFiltered: chunks.length - nonEmptyChunks.length,
      }));

      if (nonEmptyChunks.length > 0) {
        const firstChunkPreview = nonEmptyChunks[0]?.substring(0, 200) || 'EMPTY';
        console.log(`[WrittenQuestionsGeneration] First chunk preview (${nonEmptyChunks[0]?.length || 0} chars): ${firstChunkPreview}...`);
      } else {
        console.warn('[WrittenQuestionsGeneration] WARNING: No chunks found!');
      }

      return nonEmptyChunks;
    } catch (error) {
      console.error('[WrittenQuestionsGeneration] Error in fetchChunks:', error);
      throw error;
    }
  }

  async saveWrittenQuestions(params: SaveWrittenQuestionsParams): Promise<void> {
    try {
      const { error } = await supabase
        .from('written_questions')
        .update({
          title: params.title,
          questions_data: JSON.stringify({ questions: params.questions }),
          status: 'completed',
          metadata: params.metadata,
          updated_at: new Date().toISOString(),
        })
        .eq('id', params.writtenQuestionsId);

      if (error) {
        console.error('[WrittenQuestionsGeneration] Error saving written questions:', error);
        throw new Error(`Failed to save written questions: ${error.message}`);
      }

      console.log(`[WrittenQuestionsGeneration] Written questions saved to ${params.writtenQuestionsId}`);
    } catch (error) {
      console.error('[WrittenQuestionsGeneration] Error in saveWrittenQuestions:', error);
      throw error;
    }
  }

  async updateWrittenQuestionsStatus(
    writtenQuestionsId: string,
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
        .from('written_questions')
        .update(updateData)
        .eq('id', writtenQuestionsId);

      if (error) {
        console.error('[WrittenQuestionsGeneration] Error updating status:', error);
        throw new Error(`Failed to update status: ${error.message}`);
      }
    } catch (error) {
      console.error('[WrittenQuestionsGeneration] Error in updateWrittenQuestionsStatus:', error);
      throw error;
    }
  }

  getWrittenQuestionsTitle(focus?: string, questionType?: string): string {
    if (focus && focus.trim().length > 0) {
      return `Written Questions: ${focus.trim()}`;
    }
    return `Written Questions (${questionType || 'short'})`;
  }

  getPreviewText(status: string, metadata?: any): string {
    const phase = metadata?.phase || status;
    const isGenerating = status === 'generating' ||
      phase === 'generating' ||
      phase === 'mapping' ||
      phase === 'collapsing' ||
      phase === 'reducing';

    if (isGenerating) {
      const questionCount = metadata?.questionCount || 'standard';
      const questionType = metadata?.questionType || 'short';
      return `${this.getQuestionCountLabel(questionCount)} Questions • ${questionType} • Generating...`;
    }
    if (status === 'failed' || phase === 'failed') {
      return 'Written Questions • Failed';
    }
    const questionCount = metadata?.questionCount || 'standard';
    const questionType = metadata?.questionType || 'short';
    return `${this.getQuestionCountLabel(questionCount)} Questions • ${questionType}`;
  }

  private getQuestionCountLabel(count: string | number): string {
    if (typeof count === 'string') {
      const labels: Record<string, string> = {
        fewer: '5',
        standard: '10',
        more: '15',
      };
      return labels[count] || '10';
    }
    return String(count);
  }

  async generateTitleFromQuestions(questions: WrittenQuestion[]): Promise<string> {
    try {
      if (questions.length === 0) {
        return 'Written Questions';
      }

      const sampleContent = questions
        .slice(0, 3)
        .map((q) => q.question)
        .filter(q => q && q.trim().length > 0)
        .join('; ');

      if (!sampleContent || sampleContent.trim().length === 0) {
        console.warn('[WrittenQuestionsGeneration] No valid question content for title generation');
        return 'Written Questions';
      }

      const title = await this.titleGenerator.generateTitle(sampleContent);
      const trimmedTitle = title.trim();
      console.log(`[WrittenQuestionsGeneration] Generated title: "${trimmedTitle}"`);
      return trimmedTitle.length > 0 ? trimmedTitle : 'Written Questions';
    } catch (error) {
      console.error('[WrittenQuestionsGeneration] Error generating title from questions:', error);
      return 'Written Questions';
    }
  }
}
