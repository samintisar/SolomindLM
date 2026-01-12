import { supabase } from '../../config/database.js';
import { AudioOverviewGraph, OverallStateType, DialogueLine } from '../agents/AudioOverviewGraph.js';
import { env } from '../../config/env.js';
import { TitleGeneratorService } from '../processing/TitleGeneratorService.js';

// Default signed URL expiration time (24 hours)
const SIGNED_URL_EXPIRY_SECONDS = 60 * 60 * 24;

export interface AudioOverviewParams {
  documentIds: string[];
  audioType: string;
  length: string;
  focus?: string;
  onStatusUpdate?: (status: string) => void;
}

export interface AudioOverviewResult {
  transcript: string;
  audioBuffer: Buffer;
  metadata: {
    audioType: string;
    length: string;
    focus?: string;
    dialogueLines: number;
    audioSizeBytes: number;
  };
}

export class AudioOverviewGenerationService {
  private audioGraph: AudioOverviewGraph;
  private titleGenerator: TitleGeneratorService;

  constructor() {
    this.audioGraph = new AudioOverviewGraph(
      env.TOGETHER_AI_API_KEY,
      env.FAST_LLM,
      env.SMART_LLM || env.FAST_LLM
    );
    this.titleGenerator = new TitleGeneratorService(env.TOGETHER_AI_API_KEY, env.FAST_LLM);
  }

  async generateAudioOverview(params: AudioOverviewParams): Promise<AudioOverviewResult> {
    const { documentIds, audioType, length, focus, onStatusUpdate } = params;

    try {
      onStatusUpdate?.('generating');

      const chunks = await this.fetchChunks(documentIds);

      if (chunks.length === 0) {
        throw new Error('No content found in selected documents');
      }

      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        service: 'AudioOverviewGeneration',
        action: 'generate',
        audioType,
        length,
        chunksCount: chunks.length,
      }));

      onStatusUpdate?.('mapping');

      const graph = this.audioGraph.buildGraph();
      const result = await graph.invoke({
        documentIds,
        chunks,
        audioType,
        length,
        focus,
        mapOutputs: [],
        collapsedOutputs: [],
        dialogueScript: [],
        audioBuffer: Buffer.alloc(0),
        status: 'generating',
      }) as unknown as OverallStateType;

      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        service: 'AudioOverviewGeneration',
        action: 'generate_complete',
        status: result.status,
        dialogueLines: result.dialogueScript?.length || 0,
        audioSize: result.audioBuffer?.length || 0,
      }));

      // Convert dialogue script to transcript
      const transcript = result.dialogueScript
        ?.map((line: DialogueLine) => {
          const speaker = line.speaker === 'host_a' ? 'Asteria' : 'Orion';
          return `${speaker}: ${line.text}`;
        })
        .join('\n\n') || '';

      return {
        transcript,
        audioBuffer: result.audioBuffer || Buffer.alloc(0),
        metadata: {
          audioType,
          length,
          focus,
          dialogueLines: result.dialogueScript?.length || 0,
          audioSizeBytes: result.audioBuffer?.length || 0,
        },
      };
    } catch (error) {
      console.error('[AudioOverviewGeneration] Error generating audio overview:', error);
      throw error;
    }
  }

  async fetchChunks(documentIds: string[]): Promise<string[]> {
    try {
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        service: 'AudioOverviewGeneration',
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
          console.error('[AudioOverviewGeneration] Error fetching chunks:', error);
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

      const nonEmptyChunks = chunks.filter((c) => c && c.trim().length > 0);

      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        service: 'AudioOverviewGeneration',
        action: 'fetch_chunks_complete',
        totalChunks: chunks.length,
        nonEmptyChunks: nonEmptyChunks.length,
        emptyChunksFiltered: chunks.length - nonEmptyChunks.length,
      }));

      if (nonEmptyChunks.length > 0) {
        const firstChunkPreview = nonEmptyChunks[0]?.substring(0, 200) || 'EMPTY';
        console.log(`[AudioOverviewGeneration] First chunk preview (${nonEmptyChunks[0]?.length || 0} chars): ${firstChunkPreview}...`);
      } else {
        console.warn('[AudioOverviewGeneration] WARNING: No chunks found!');
      }

      return nonEmptyChunks;
    } catch (error) {
      console.error('[AudioOverviewGeneration] Error in fetchChunks:', error);
      throw error;
    }
  }

  async createAudioOverview(
    userId: string,
    notebookId: string,
    config: {
      audioType: string;
      length: string;
      focus?: string;
      documentIds: string[];
    }
  ): Promise<string> {
    const id = crypto.randomUUID();

    const { error } = await supabase
      .from('audio_overviews')
      .insert({
        id,
        user_id: userId,
        notebook_id: notebookId,
        title: 'Audio Overview',
        status: 'draft',
        audio_type: config.audioType,
        metadata: {
          ...config,
          createdAt: new Date().toISOString(),
        },
      });

    if (error) {
      console.error('[AudioOverviewGeneration] Error creating audio overview:', error);
      throw new Error(`Failed to create audio overview: ${error.message}`);
    }

    console.log(`[AudioOverviewGeneration] Created audio overview ${id}`);
    return id;
  }

  async saveAudioOverview(
    id: string,
    data: {
      title?: string;
      transcript?: string;
      audio_url?: string;
      status: string;
      metadata?: any;
    }
  ): Promise<void> {
    const updateData: any = {
      ...data,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('audio_overviews')
      .update(updateData)
      .eq('id', id);

    if (error) {
      console.error('[AudioOverviewGeneration] Error saving audio overview:', error);
      throw new Error(`Failed to save audio overview: ${error.message}`);
    }

    console.log(`[AudioOverviewGeneration] Saved audio overview ${id}`);
  }

  async updateAudioOverviewStatus(
    id: string,
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
        .from('audio_overviews')
        .update(updateData)
        .eq('id', id);

      if (error) {
        console.error('[AudioOverviewGeneration] Error updating status:', error);
        throw new Error(`Failed to update status: ${error.message}`);
      }

      console.log(`[AudioOverviewGeneration] Updated status for ${id} to ${status}`);
    } catch (error) {
      console.error('[AudioOverviewGeneration] Error in updateAudioOverviewStatus:', error);
      throw error;
    }
  }

  async generateTitle(transcript: string): Promise<string> {
    try {
      const contentChunk = transcript.substring(0, 500);
      const title = await this.titleGenerator.generateTitle(contentChunk);
      console.log(`[AudioOverviewGeneration] Generated title: ${title}`);
      return title;
    } catch (error) {
      console.error('[AudioOverviewGeneration] Error generating title:', error);
      return 'Audio Overview';
    }
  }

  async uploadAudio(buffer: Buffer, audioOverviewId: string): Promise<string> {
    const filePath = `audio-overviews/${audioOverviewId}/${Date.now()}.mp3`;

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      service: 'AudioOverviewGeneration',
      action: 'upload_audio',
      audioOverviewId,
      fileSize: buffer.length,
      filePath,
    }));

    const { data, error } = await supabase.storage
      .from('audio-overviews')
      .upload(filePath, buffer, {
        contentType: 'audio/mpeg',
        upsert: false,
      });

    if (error) {
      console.error('[AudioOverviewGeneration] Upload failed:', error);
      throw new Error(`Failed to upload audio: ${error.message}`);
    }

    // Security: Use signed URL instead of public URL for audio files
    const { data: signedData, error: signError } = await supabase.storage
      .from('audio-overviews')
      .createSignedUrl(filePath, SIGNED_URL_EXPIRY_SECONDS);

    if (signError || !signedData?.signedUrl) {
      console.error('[AudioOverviewGeneration] Failed to generate signed URL:', signError);
      throw new Error('Failed to generate signed URL for audio');
    }

    console.log(`[AudioOverviewGeneration] Audio uploaded with signed URL`);
    return signedData.signedUrl;
  }

  getAudioOverviewTitle(audioType: string): string {
    const titles: Record<string, string> = {
      deep_dive: 'Deep Dive',
      brief: 'Brief Overview',
      critique: 'Critique',
      debate: 'Debate',
    };
    return titles[audioType] || 'Audio Overview';
  }

  getPreviewText(audioType: string, status: string, metadata?: any): string {
    const phase = metadata?.phase || status;
    const isGenerating =
      status === 'generating' ||
      phase === 'generating' ||
      phase === 'mapping' ||
      phase === 'reducing' ||
      phase === 'synthesizing';

    if (isGenerating) {
      return 'Audio Overview • Generating...';
    }
    if (status === 'failed' || phase === 'failed') {
      return 'Audio Overview • Failed';
    }
    return `Audio Overview • ${this.getAudioOverviewTitle(audioType)}`;
  }
}
