import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

export type StudioTool =
  | "report"
  | "spreadsheet"
  | "infographic"
  | "flashcards"
  | "quiz"
  | "audio"
  | "writtenQuestions"
  | "mindmap";

export type PromptSortBy = "saves" | "rating" | "newest";

export interface PublicPrompt {
  _id: Id<"studioPrompts">;
  userId: Id<"users">;
  title: string;
  description?: string;
  promptText: string;
  studioTool: StudioTool;
  visibility: "private" | "public";
  status: "active" | "hidden" | "removed";
  saveCount?: number;
  ratingCount?: number;
  ratingAverage?: number;
  bayesianRating?: number;
  createdAt: number;
  updatedAt: number;
  publishedAt?: number;
  sourcePromptId?: Id<"studioPrompts">;
}

// ── Queries ────────────────────────────────────────────────────────────

/** List active public prompts for a given tool. */
export function usePublicPrompts(
  studioTool: StudioTool,
  sortBy: PromptSortBy = "saves",
  searchQuery?: string
) {
  return useQuery(api.studio.prompts.index.listPublicPrompts, {
    studioTool,
    sortBy,
    query: searchQuery,
    paginationOpts: { numItems: 20, cursor: null },
  });
}

/** List the current user's prompts. */
export function useMyPrompts(studioTool?: StudioTool) {
  return useQuery(
    api.studio.prompts.index.listMyPrompts,
    studioTool
      ? { studioTool, paginationOpts: { numItems: 50, cursor: null } }
      : { paginationOpts: { numItems: 50, cursor: null } }
  );
}

/** Get a single prompt by ID. */
export function usePrompt(promptId: Id<"studioPrompts"> | null) {
  return useQuery(api.studio.prompts.index.getPrompt, promptId ? { promptId } : "skip");
}

/** Check if the current user has saved a public prompt. */
export function useHasSavedPrompt(publicPromptId: Id<"studioPrompts"> | null) {
  return useQuery(
    api.studio.prompts.index.hasSavedPrompt,
    publicPromptId ? { publicPromptId } : "skip"
  );
}

/** Get the current user's rating for a public prompt. */
export function useMyRating(publicPromptId: Id<"studioPrompts"> | null) {
  return useQuery(
    api.studio.prompts.index.getMyRating,
    publicPromptId ? { publicPromptId } : "skip"
  );
}

// ── Mutations ──────────────────────────────────────────────────────────

/** Create a new private prompt. */
export function useCreatePrompt() {
  const create = useMutation(api.studio.prompts.index.createPrompt);
  return async (args: {
    title: string;
    description?: string;
    promptText: string;
    studioTool: StudioTool;
    notebookId?: Id<"notebooks">;
  }) => {
    return await create({
      title: args.title,
      description: args.description,
      promptText: args.promptText,
      studioTool: args.studioTool,
      notebookId: args.notebookId,
    });
  };
}

/** Publish a private prompt to the public library. */
export function usePublishPrompt() {
  const publish = useMutation(api.studio.prompts.index.publishPrompt);
  return async (promptId: Id<"studioPrompts">) => {
    await publish({ promptId });
  };
}

/** Retract a public prompt back to private. */
export function useUnpublishPrompt() {
  const unpublish = useMutation(api.studio.prompts.index.unpublishPrompt);
  return async (promptId: Id<"studioPrompts">) => {
    await unpublish({ promptId });
  };
}

/** Save a public prompt into the user's private library. */
export function useSavePublicPrompt() {
  const save = useMutation(api.studio.prompts.index.savePublicPrompt);
  return async (publicPromptId: Id<"studioPrompts">, notebookId?: Id<"notebooks">) => {
    return await save({ publicPromptId, notebookId });
  };
}

/** Rate a public prompt (1-5). */
export function useRatePrompt() {
  const rate = useMutation(api.studio.prompts.index.ratePrompt);
  return async (publicPromptId: Id<"studioPrompts">, rating: number) => {
    await rate({ publicPromptId, rating });
  };
}

/** Update a prompt the user owns. */
export function useUpdatePrompt() {
  const update = useMutation(api.studio.prompts.index.updatePrompt);
  return async (
    promptId: Id<"studioPrompts">,
    updates: { title?: string; description?: string; promptText?: string }
  ) => {
    await update({ promptId, ...updates });
  };
}

/** Delete a prompt. */
export function useDeletePrompt() {
  const del = useMutation(api.studio.prompts.index.deletePrompt);
  return async (promptId: Id<"studioPrompts">) => {
    await del({ promptId });
  };
}

/** Report a public prompt. */
export function useReportPrompt() {
  const report = useMutation(api.studio.prompts.index.reportPrompt);
  return async (promptId: Id<"studioPrompts">, reason?: string) => {
    await report({ promptId, reason });
  };
}
