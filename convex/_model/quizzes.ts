import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Id, Doc } from "../_generated/dataModel";

/**
 * Database operations for quizzes.
 * No query/mutation/action exports — used by convex/quizzes.ts and jobs.
 */

export async function getQuiz(
  ctx: QueryCtx,
  quizId: Id<"quizzes">
): Promise<Doc<"quizzes"> | null> {
  return await ctx.db.get("quizzes", quizId);
}

export async function listByNotebook(
  ctx: QueryCtx,
  notebookId: Id<"notebooks">,
  userId?: Id<"users">
): Promise<Doc<"quizzes">[]> {
  const query = ctx.db
    .query("quizzes")
    .withIndex("by_notebook", (q) => q.eq("notebookId", notebookId));

  if (userId) {
    return await query
      .filter((q) => q.eq(q.field("userId"), userId))
      .order("desc")
      .collect();
  }
  return await query.order("desc").collect();
}

export type QuizCreate = {
  userId: Id<"users">;
  notebookId: Id<"notebooks">;
  title: string;
  questionsData?: unknown[];
  metadata?: unknown;
};

export async function createQuiz(ctx: MutationCtx, data: QuizCreate): Promise<Id<"quizzes">> {
  const now = Date.now();
  return await ctx.db.insert("quizzes", {
    userId: data.userId,
    notebookId: data.notebookId,
    title: data.title,
    status: "draft",
    questionsData: data.questionsData ?? [],
    metadata: data.metadata,
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * Create a quiz and return the created document.
 */
export async function createQuizAndFetch(
  ctx: MutationCtx,
  data: QuizCreate
): Promise<Doc<"quizzes">> {
  const id = await createQuiz(ctx, data);
  const quiz = await getQuiz(ctx, id);
  if (!quiz) throw new Error("Failed to create quiz");
  return quiz;
}

export type QuizUpdate = {
  title?: string;
  status?: string;
  questionsData?: unknown[];
  metadata?: unknown;
};

export async function updateQuiz(
  ctx: MutationCtx,
  quizId: Id<"quizzes">,
  updates: QuizUpdate,
  mergeMetadata = false
): Promise<void> {
  const updateData: Record<string, unknown> = {
    ...updates,
    updatedAt: Date.now(),
  };

  if (mergeMetadata && updates.metadata) {
    const existing = await getQuiz(ctx, quizId);
    if (existing) {
      updateData.metadata = {
        ...(existing.metadata ?? {}),
        ...(updates.metadata as Record<string, unknown>),
      };
    }
  }

  await ctx.db.patch("quizzes", quizId, updateData);
}

export async function updateQuizStatus(
  ctx: MutationCtx,
  quizId: Id<"quizzes">,
  status: string
): Promise<void> {
  await ctx.db.patch("quizzes", quizId, {
    status,
    updatedAt: Date.now(),
  });
}

export async function updateQuizData(
  ctx: MutationCtx,
  quizId: Id<"quizzes">,
  questionsData: unknown[]
): Promise<void> {
  await ctx.db.patch("quizzes", quizId, {
    questionsData,
    status: "completed",
    updatedAt: Date.now(),
  });
}

export async function patchQuiz(
  ctx: MutationCtx,
  quizId: Id<"quizzes">,
  patch: Record<string, unknown>
): Promise<void> {
  // If updating metadata, merge with existing metadata instead of replacing
  if (patch.metadata) {
    const existing = await getQuiz(ctx, quizId);
    if (existing) {
      patch = {
        ...patch,
        metadata: {
          ...((existing.metadata as Record<string, unknown>) ?? {}),
          ...(patch.metadata as Record<string, unknown>),
        },
      };
    }
  }

  await ctx.db.patch("quizzes", quizId, {
    ...patch,
    updatedAt: Date.now(),
  });
}

export async function patchQuizUserAnswer(
  ctx: MutationCtx,
  quizId: Id<"quizzes">,
  questionIndex: number,
  selectedOption: number
): Promise<void> {
  const quiz = await getQuiz(ctx, quizId);
  if (!quiz) throw new Error("Quiz not found");

  const existingUserAnswers =
    (quiz.metadata as { userAnswers?: Record<number, number> })?.userAnswers || {};

  await ctx.db.patch("quizzes", quizId, {
    metadata: {
      ...quiz.metadata,
      userAnswers: {
        ...existingUserAnswers,
        [questionIndex]: selectedOption,
      },
    },
    updatedAt: Date.now(),
  });
}

export async function deleteQuiz(ctx: MutationCtx, quizId: Id<"quizzes">): Promise<void> {
  await ctx.db.delete("quizzes", quizId);
}
