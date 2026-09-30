import { type Infer, v } from "convex/values";
import { internal } from "../../_generated/api";
import { internalMutation, type MutationCtx } from "../../_generated/server";
import { normalizeMathMarkdown } from "../../_shared/mathMarkdown";
import { scheduleStudioJobCompletionPush } from "../../push/notify";
import { buildErrorMetadata } from "./jobErrorUtils";

export const saveAudioOverviewResults = internalMutation({
  args: {
    audioOverviewId: v.id("audioOverviews"),
    /** Omitted for script-only (`skipTts`) eval jobs. */
    audioUrl: v.optional(v.string()),
    transcript: v.string(),
    metadata: v.any(),
  },
  handler: async (ctx, args) => {
    const audioOverview = await ctx.db.get(args.audioOverviewId);
    if (!audioOverview) return null;

    const normalizedTranscript = normalizeMathMarkdown(args.transcript);
    const title = args.metadata?.title ?? "Audio Overview";
    // The script handed to synthesis is now in `transcript`, and the chunk MP3s are joined.
    const {
      synthesisInput: _synthesisInput,
      synthesis: _synthesis,
      ...existingMetadata
    } = audioOverview.metadata || {};
    await deleteSynthesisChunkFiles(ctx, audioOverview.metadata);

    await ctx.db.patch(args.audioOverviewId, {
      transcript: normalizedTranscript,
      audioUrl: args.audioUrl,
      status: "completed",
      updatedAt: Date.now(),
      title,
      metadata: {
        ...existingMetadata,
        ...args.metadata,
        completedAt: Date.now(),
      },
    });
    await scheduleStudioJobCompletionPush(ctx, {
      userId: audioOverview.userId,
      notebookId: audioOverview.notebookId,
      itemId: args.audioOverviewId,
      kind: "audioOverview",
      title,
    });
  },
});

export const updateAudioOverviewTitle = internalMutation({
  args: {
    audioOverviewId: v.id("audioOverviews"),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.audioOverviewId, {
      title: args.title,
      updatedAt: Date.now(),
    });
  },
});

export const updateAudioOverviewStatus = internalMutation({
  args: {
    audioOverviewId: v.id("audioOverviews"),
    status: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const audioOverview = await ctx.db.get(args.audioOverviewId);
    if (!audioOverview) return null;

    const updates: { status: string; updatedAt: number; metadata?: Record<string, unknown> } = {
      status: args.status,
      updatedAt: Date.now(),
    };
    if (args.metadata) {
      // Merge: the row's metadata also holds the user's settings (audioType, length, focus),
      // which later job phases read back.
      updates.metadata = { ...audioOverview.metadata, ...args.metadata };
    }
    await ctx.db.patch(args.audioOverviewId, updates);
  },
});

export const markAudioOverviewFailed = internalMutation({
  args: {
    audioOverviewId: v.id("audioOverviews"),
    error: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const audioOverview = await ctx.db.get(args.audioOverviewId);
    if (!audioOverview) return null;

    const errorMetadata = buildErrorMetadata(
      args.error,
      args.metadata?.phase || "unknown",
      args.metadata
    );
    // Keep the user's settings; drop intermediate map output, the synthesis script and the chunk
    // MP3s, which a failed job no longer needs.
    const {
      mapResults: _mapResults,
      synthesisInput: _synthesisInput,
      synthesis: _synthesis,
      ...existingMetadata
    } = audioOverview.metadata || {};
    await deleteSynthesisChunkFiles(ctx, audioOverview.metadata);
    await ctx.db.patch(args.audioOverviewId, {
      status: "failed",
      updatedAt: Date.now(),
      metadata: {
        ...existingMetadata,
        ...args.metadata,
        ...errorMetadata,
      },
    });
  },
});

// Multi-phase audio overview helpers
export const initAudioOverviewMapPhase = internalMutation({
  args: {
    audioOverviewId: v.id("audioOverviews"),
    totalMapTasks: v.number(),
  },
  handler: async (ctx, args) => {
    const audioOverview = await ctx.db.get(args.audioOverviewId);
    if (!audioOverview) return null;

    await ctx.db.patch(args.audioOverviewId, {
      status: "generating",
      updatedAt: Date.now(),
      metadata: {
        ...audioOverview.metadata,
        phase: "map_processing",
        progress: 30,
        currentStep: "Processing content...",
        totalMapTasks: args.totalMapTasks,
        completedMapTasks: 0,
        mapResults: {},
      },
    });
    return args.audioOverviewId;
  },
});

export const storeAudioOverviewMapResult = internalMutation({
  args: {
    audioOverviewId: v.id("audioOverviews"),
    chunkIndex: v.number(),
    result: v.string(),
  },
  handler: async (ctx, args) => {
    const audioOverview = await ctx.db.get(args.audioOverviewId);
    if (!audioOverview) return null;

    const existingResults = audioOverview.metadata?.mapResults || {};
    const updatedResults = {
      ...existingResults,
      [args.chunkIndex]: args.result,
    };

    const completedCount = Object.keys(updatedResults).length;
    const totalCount = audioOverview.metadata?.totalMapTasks || 0;

    await ctx.db.patch(args.audioOverviewId, {
      updatedAt: Date.now(),
      metadata: {
        ...audioOverview.metadata,
        mapResults: updatedResults,
        completedMapTasks: completedCount,
        progress: 30 + Math.floor((completedCount / totalCount) * 30),
      },
    });
    return args.audioOverviewId;
  },
});

const tokenUsageValidator = v.object({
  prompt: v.number(),
  completion: v.number(),
  total: v.number(),
});

const synthesisInputValidator = v.object({
  script: v.array(
    v.object({
      speaker: v.union(v.literal("host_a"), v.literal("host_b")),
      text: v.string(),
    })
  ),
  title: v.string(),
  // Finalize clears mapResults from the row before writing the script, so the map stats and
  // map/reduce telemetry are computed there and carried over.
  mapSuccessCount: v.number(),
  mapFailedCount: v.number(),
  telemetry: v.object({
    tokenUsage: v.optional(tokenUsageValidator),
    tokenUsageSource: v.optional(v.union(v.literal("provider"), v.literal("estimated"))),
    stageSpans: v.optional(
      v.array(
        v.object({
          stage: v.union(
            v.literal("retrieve"),
            v.literal("rerank"),
            v.literal("select"),
            v.literal("map"),
            v.literal("reduce"),
            v.literal("parse"),
            v.literal("tts")
          ),
          latencyMs: v.number(),
          tokenUsage: v.optional(tokenUsageValidator),
        })
      )
    ),
  }),
});

export type AudioSynthesisInput = Infer<typeof synthesisInputValidator>;

const synthesisChunkRangeValidator = v.object({ start: v.number(), end: v.number() });

const synthesisChunkResultValidator = v.object({
  /** Absent when every line in the chunk failed to synthesize. */
  storageId: v.optional(v.id("_storage")),
  synthesizedLines: v.number(),
  failedLines: v.number(),
  firstError: v.optional(v.string()),
  latencyMs: v.number(),
});

export type AudioSynthesisChunkResult = Infer<typeof synthesisChunkResultValidator>;

/** `metadata.synthesis`: the chunk plan and each finished chunk's result, keyed by chunk index. */
export type AudioSynthesisState = {
  chunks: Infer<typeof synthesisChunkRangeValidator>[];
  done: Record<string, AudioSynthesisChunkResult>;
  startedAt: number;
};

/** Deletes the chunk MP3s a synthesis stored. A finished or failed job no longer needs them. */
async function deleteSynthesisChunkFiles(ctx: MutationCtx, metadata: unknown): Promise<void> {
  const synthesis = (metadata as { synthesis?: AudioSynthesisState } | undefined)?.synthesis;
  for (const chunk of Object.values(synthesis?.done ?? {})) {
    if (chunk.storageId) await ctx.storage.delete(chunk.storageId);
  }
}

/**
 * Hands the finished script to the synthesis phase, which runs as its own action so TTS gets a
 * full action time budget. Stored as `metadata.synthesisInput`, which the save and failure
 * mutations drop. Returns false if the row was deleted.
 */
export const storeAudioOverviewScript = internalMutation({
  args: {
    audioOverviewId: v.id("audioOverviews"),
    synthesisInput: synthesisInputValidator,
  },
  handler: async (ctx, args) => {
    const audioOverview = await ctx.db.get(args.audioOverviewId);
    if (!audioOverview) return false;

    await ctx.db.patch(args.audioOverviewId, {
      status: "generating",
      updatedAt: Date.now(),
      metadata: {
        ...audioOverview.metadata,
        phase: "synthesizing",
        progress: 70,
        currentStep: "Synthesizing audio...",
        synthesisInput: args.synthesisInput,
      },
    });
    return true;
  },
});

/**
 * Records the synthesis chunk plan (see planSynthesisChunks) before the chunk actions start.
 * Returns false if the row was deleted, is no longer generating, or was already planned, so a
 * repeated planner run can't orphan chunks already stored.
 */
export const initAudioSynthesis = internalMutation({
  args: {
    audioOverviewId: v.id("audioOverviews"),
    chunks: v.array(synthesisChunkRangeValidator),
  },
  handler: async (ctx, args) => {
    const audioOverview = await ctx.db.get(args.audioOverviewId);
    if (
      !audioOverview ||
      audioOverview.status !== "generating" ||
      audioOverview.metadata?.synthesis
    ) {
      return false;
    }

    const synthesis: AudioSynthesisState = { chunks: args.chunks, done: {}, startedAt: Date.now() };
    await ctx.db.patch(args.audioOverviewId, {
      updatedAt: Date.now(),
      metadata: {
        ...audioOverview.metadata,
        phase: "synthesizing",
        progress: 70,
        currentStep: "Synthesizing audio...",
        synthesis,
      },
    });
    return true;
  },
});

/**
 * Stores one synthesized chunk. The call that completes the plan schedules assembly in the same
 * transaction, so exactly one assembly runs and a failure after recording can't strand the job.
 * A result the job can't use (row deleted or no longer generating, or a chunk recorded twice
 * after a retry) has its file deleted.
 */
export const recordAudioSynthesisChunk = internalMutation({
  args: {
    audioOverviewId: v.id("audioOverviews"),
    chunkIndex: v.number(),
    result: synthesisChunkResultValidator,
  },
  handler: async (ctx, args) => {
    const audioOverview = await ctx.db.get(args.audioOverviewId);
    const synthesis = audioOverview?.metadata?.synthesis as AudioSynthesisState | undefined;
    if (
      !audioOverview ||
      audioOverview.status !== "generating" ||
      !synthesis ||
      synthesis.done[args.chunkIndex] !== undefined
    ) {
      if (args.result.storageId) await ctx.storage.delete(args.result.storageId);
      return { isLast: false };
    }

    const done = { ...synthesis.done, [args.chunkIndex]: args.result };
    const doneCount = Object.keys(done).length;
    const total = synthesis.chunks.length;
    await ctx.db.patch(args.audioOverviewId, {
      updatedAt: Date.now(),
      metadata: {
        ...audioOverview.metadata,
        progress: 70 + Math.floor((doneCount / total) * 25),
        synthesis: { ...synthesis, done },
      },
    });
    const isLast = doneCount === total;
    if (isLast) {
      await ctx.scheduler.runAfter(0, internal.studio.audio.job.assembleAudioOverviewPhase, {
        audioOverviewId: args.audioOverviewId,
        userId: audioOverview.userId,
        notebookId: audioOverview.notebookId,
      });
    }
    return { isLast };
  },
});

export const clearAudioOverviewMapData = internalMutation({
  args: {
    audioOverviewId: v.id("audioOverviews"),
  },
  handler: async (ctx, args) => {
    const audioOverview = await ctx.db.get(args.audioOverviewId);
    if (!audioOverview) return null;

    const { mapResults: _mapResults, ...restMetadata } = audioOverview.metadata || {};
    await ctx.db.patch(args.audioOverviewId, {
      updatedAt: Date.now(),
      metadata: restMetadata,
    });
    return args.audioOverviewId;
  },
});
