import { supabase } from '../../config/database.js';
import { QuizGraph, OverallStateType, QuizQuestion } from '../agents/QuizGraph.js';
import { env } from '../../config/env.js';
import { TitleGeneratorService } from '../processing/TitleGeneratorService.js';

export interface QuizGenerationParams {
  documentIds: string[];
  questionCount: number; // 10 (fewer), 20 (standard), or 30 (more)
  difficulty: string; // 'easy', 'medium', 'hard'
  focus?: string;
  onStatusUpdate?: (status: string) => void;
}

export interface QuizResult {
  questions: QuizQuestion[];
  metadata: {
    documentIds: string[];
    chunksProcessed: number;
    questionCount: number;
    difficulty: string;
    focus?: string;
  };
}

export interface SaveQuizParams {
  quizId: string;
  title: string;
  questions: QuizQuestion[];
  metadata: any;
}

export class QuizGenerationService {
  private quizGraph: QuizGraph;
  private titleGenerator: TitleGeneratorService;

  constructor() {
    this.quizGraph = new QuizGraph(
      env.TOGETHER_AI_API_KEY,
      env.FAST_LLM,
      env.SMART_LLM || env.FAST_LLM
    );
    this.titleGenerator = new TitleGeneratorService(env.TOGETHER_AI_API_KEY, env.FAST_LLM);
  }

  async generateQuiz(params: QuizGenerationParams): Promise<QuizResult> {
    const { documentIds, questionCount, difficulty, focus, onStatusUpdate } = params;

    try {
      onStatusUpdate?.('generating');

      const chunks = await this.fetchChunks(documentIds);

      if (chunks.length === 0) {
        throw new Error('No content found in selected documents');
      }

      console.log(
        `[QuizGeneration] Processing ${chunks.length} chunks for ${questionCount} ${difficulty} quiz questions`
      );

      const graph = this.quizGraph.buildGraph();
      const result = await graph.invoke({
        documentIds,
        chunks,
        questionCount,
        difficulty,
        focus,
        mapOutputs: [],
        collapsedOutputs: [],
        finalOutput: [],
        status: 'generating',
      }) as unknown as OverallStateType;

      console.log(
        `[QuizGeneration] Quiz generation completed. Status: ${result.status}, Questions: ${result.finalOutput.length}`
      );

      return {
        questions: result.finalOutput || [],
        metadata: {
          documentIds,
          chunksProcessed: chunks.length,
          questionCount,
          difficulty,
          focus,
        },
      };
    } catch (error) {
      console.error('[QuizGeneration] Error generating quiz:', error);
      throw error;
    }
  }

  async fetchChunks(documentIds: string[]): Promise<string[]> {
    try {
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        service: 'QuizGeneration',
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
          console.error('[QuizGeneration] Error fetching chunks:', error);
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
        service: 'QuizGeneration',
        action: 'fetch_chunks_complete',
        totalChunks: chunks.length,
        nonEmptyChunks: nonEmptyChunks.length,
        emptyChunksFiltered: chunks.length - nonEmptyChunks.length,
      }));

      if (nonEmptyChunks.length > 0) {
        const firstChunkPreview = nonEmptyChunks[0]?.substring(0, 200) || 'EMPTY';
        console.log(`[QuizGeneration] First chunk preview (${nonEmptyChunks[0]?.length || 0} chars): ${firstChunkPreview}...`);
      } else {
        console.warn('[QuizGeneration] WARNING: No chunks found!');
      }

      return nonEmptyChunks;
    } catch (error) {
      console.error('[QuizGeneration] Error in fetchChunks:', error);
      throw error;
    }
  }

  async saveQuiz(params: SaveQuizParams): Promise<void> {
    try {
      const { error } = await supabase
        .from('quizzes')
        .update({
          title: params.title,
          questions_data: JSON.stringify({ questions: params.questions }),
          status: 'completed',
          metadata: params.metadata,
          updated_at: new Date().toISOString(),
        })
        .eq('id', params.quizId);

      if (error) {
        console.error('[QuizGeneration] Error saving quiz:', error);
        throw new Error(`Failed to save quiz: ${error.message}`);
      }

      console.log(`[QuizGeneration] Quiz saved to quiz ${params.quizId}`);
    } catch (error) {
      console.error('[QuizGeneration] Error in saveQuiz:', error);
      throw error;
    }
  }

  async updateQuizStatus(
    quizId: string,
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
        .from('quizzes')
        .update(updateData)
        .eq('id', quizId);

      if (error) {
        console.error('[QuizGeneration] Error updating status:', error);
        throw new Error(`Failed to update status: ${error.message}`);
      }
    } catch (error) {
      console.error('[QuizGeneration] Error in updateQuizStatus:', error);
      throw error;
    }
  }

  getQuizTitle(focus?: string): string {
    if (focus && focus.trim().length > 0) {
      return `Quiz: ${focus.trim()}`;
    }
    return 'Quiz';
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
      const difficulty = metadata?.difficulty || 'medium';
      return `${this.getQuestionCountLabel(questionCount)} Questions • ${difficulty} • Generating...`;
    }
    if (status === 'failed' || phase === 'failed') {
      return 'Quiz • Failed';
    }
    const questionCount = metadata?.questionCount || 'standard';
    const difficulty = metadata?.difficulty || 'medium';
    return `${this.getQuestionCountLabel(questionCount)} Questions • ${difficulty}`;
  }

  private getQuestionCountLabel(count: string | number): string {
    if (typeof count === 'string') {
      const labels: Record<string, string> = {
        fewer: '10',
        standard: '20',
        more: '30',
      };
      return labels[count] || '20';
    }
    return String(count);
  }

  async generateTitleFromQuestions(questions: QuizQuestion[]): Promise<string> {
    try {
      if (questions.length === 0) {
        return 'Quiz';
      }

      const sampleContent = questions
        .slice(0, 5)
        .map((q) => q.question)
        .filter(q => q && q.trim().length > 0)
        .join('; ');

      if (!sampleContent || sampleContent.trim().length === 0) {
        console.warn('[QuizGeneration] No valid question content for title generation');
        return 'Quiz';
      }

      const title = await this.titleGenerator.generateTitle(sampleContent);
      const trimmedTitle = title.trim();
      console.log(`[QuizGeneration] Generated title: "${trimmedTitle}"`);
      return trimmedTitle.length > 0 ? trimmedTitle : 'Quiz';
    } catch (error) {
      console.error('[QuizGeneration] Error generating title from questions:', error);
      return 'Quiz';
    }
  }

  async generateTitleFromChunks(chunks: string[]): Promise<string> {
    try {
      if (chunks.length === 0) {
        return 'Quiz';
      }

      const title = await this.titleGenerator.generateTitle(chunks[0] || 'No content');
      console.log(`[QuizGeneration] Generated title from chunks: ${title}`);
      return title;
    } catch (error) {
      console.error('[QuizGeneration] Error generating title from chunks:', error);
      return this.getQuizTitle();
    }
  }
}
