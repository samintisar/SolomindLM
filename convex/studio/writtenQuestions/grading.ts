"use node";

import { v } from "convex/values";
import { action } from "../../_generated/server";
import { internal, api } from "../../_generated/api";
import { getAuthUserId } from "../../auth";
import {
  WrittenQuestionsGradingService,
  type WrittenQuestion,
} from "../../_services/grading/WrittenQuestionsGradingService";

/**
 * Submit an answer and grade it
 * This action stores the answer, triggers grading, and returns the result
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

    // Get the written question set first to verify ownership and get the question
    const writtenQuestion = await ctx.runQuery(api.studio.writtenQuestions.index.get, {
      id: writtenQuestionsId,
    });

    if (!writtenQuestion) {
      throw new Error("Written question set not found");
    }

    const canEdit = await ctx.runQuery(internal.notebooks.index.canEditNotebookInternal, {
      notebookId: writtenQuestion.notebookId,
      userId,
    });
    if (!canEdit) {
      throw new Error("Access denied");
    }

    // Find the specific question
    const question = writtenQuestion.questionsData?.find((q: any) => q.id === questionId);
    if (!question) {
      throw new Error("Question not found");
    }

    // Store "grading in progress" state
    await ctx.runMutation(internal.studio.writtenQuestions.index.patchUserAnswer, {
      writtenQuestionId: writtenQuestionsId,
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
