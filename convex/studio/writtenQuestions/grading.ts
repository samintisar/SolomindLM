"use node";

import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { action } from "../../_generated/server";
import { InputValidationError } from "../../_lib/errors";
import { rateLimiter } from "../../_lib/rateLimits";
import { toConvexError } from "../../_lib/serviceErrors";
import {
  type WrittenQuestion,
  WrittenQuestionsGradingService,
} from "../../_services/grading/WrittenQuestionsGradingService";
import { getAuthUserId } from "../../auth";

const GRADING_RATE_LIMITED = "You've graded a lot of answers in the last hour. Try again later.";

/**
 * Submit an answer and grade it. The answer and grade are saved where the caller practises (the
 * shared set, or a viewer's own progress); each grade counts against the caller's hourly grading
 * limit.
 */
export const submitAndGrade = action({
  args: {
    writtenQuestionsId: v.id("writtenQuestions"),
    questionId: v.string(),
    answer: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const { writtenQuestionsId, questionId, answer } = args;

    const writtenQuestion = await ctx.runQuery(
      internal.studio.writtenQuestions.index.getWrittenQuestionForUserInternal,
      {
        id: writtenQuestionsId,
        userId,
      }
    );

    if (!writtenQuestion) {
      throw new Error("Written question set not found");
    }

    // Find the specific question
    const question = writtenQuestion.questionsData?.find((q: any) => q.id === questionId);
    if (!question) {
      throw new Error("Question not found");
    }

    // Each grade is an LLM call, charged to the caller (owner, editor or viewer alike).
    const { ok } = await rateLimiter.limit(ctx, "writtenAnswerGrade", { key: userId });
    if (!ok) throw toConvexError(new InputValidationError(GRADING_RATE_LIMITED));

    // Store "grading in progress" state
    await ctx.runMutation(internal.studio.writtenQuestions.index.patchUserAnswer, {
      writtenQuestionId: writtenQuestionsId,
      userId,
      questionId: questionId,
      answerData: {
        answer,
        submittedAt: Date.now(),
        graded: false,
      },
    });

    // Grade the answer using the grading service
    const gradingService = new WrittenQuestionsGradingService();
    const gradingResult = await gradingService.gradeAnswer({
      question: question as WrittenQuestion,
      userAnswer: answer,
    });

    // Update with the graded result
    await ctx.runMutation(internal.studio.writtenQuestions.index.patchUserAnswer, {
      writtenQuestionId: writtenQuestionsId,
      userId,
      questionId: questionId,
      answerData: {
        answer,
        submittedAt: Date.now(),
        graded: true,
        score: gradingResult.score,
        maxScore: gradingResult.maxScore,
        feedback: gradingResult.feedback,
        strengths: gradingResult.strengths,
        improvements: gradingResult.improvements,
        gradedAt: Date.now(),
      },
    });

    return {
      success: true,
      score: gradingResult.score,
      maxScore: gradingResult.maxScore,
    };
  },
});
