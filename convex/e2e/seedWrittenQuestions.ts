import { v } from "convex/values";
import { mutation } from "../_generated/server";

/**
 * Create a completed written-questions set with known short questions for E2E.
 * No linked documents — grading (when exercised) runs answer-vs-rubric only.
 */
export const createWrittenQuestionSet = mutation({
  args: {
    email: v.string(),
    notebookId: v.string(),
    title: v.string(),
  },
  returns: v.object({
    writtenQuestionsId: v.string(),
    title: v.string(),
    questionCount: v.number(),
  }),
  handler: async (ctx, { email, notebookId, title }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .first();
    if (!user) {
      throw new Error(`User with email ${email} not found`);
    }

    const now = Date.now();
    const questionsData = [
      {
        id: "q1",
        question: "Name one driver of the urban heat island effect.",
        questionType: "short",
        rubric: { maxPoints: 5, criteria: ["Identifies a valid UHI driver"] },
      },
      {
        id: "q2",
        question: "Name one strategy for mitigating the urban heat island effect.",
        questionType: "short",
        rubric: { maxPoints: 5, criteria: ["Identifies a valid mitigation strategy"] },
      },
    ];

    const writtenQuestionsId = await ctx.db.insert("writtenQuestions", {
      userId: user._id,
      notebookId: notebookId as any,
      title,
      status: "completed",
      questionType: "short",
      questionsData,
      metadata: { questionCount: 2, difficulty: "medium", questionType: "short" },
      createdAt: now,
      updatedAt: now,
    });

    return {
      writtenQuestionsId: writtenQuestionsId.toString(),
      title,
      questionCount: 2,
    };
  },
});
