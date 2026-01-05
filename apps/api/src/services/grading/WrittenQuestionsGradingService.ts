import { ChatTogetherAI } from '@langchain/community/chat_models/togetherai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { invokeWithTimeout, invokeWithRetry } from '../agents/shared/index.js';

export interface WrittenQuestion {
  id: string;
  question: string;
  questionType: 'short' | 'essay';
  rubric: {
    maxPoints: number;
    criteria: string[];
  };
  modelAnswer?: string;
}

export interface GradingRequest {
  question: WrittenQuestion;
  userAnswer: string;
  referenceContext?: string;
}

export interface GradingResult {
  score: number;
  maxScore: number;
  feedback: string;
  strengths: string[];
  improvements: string[];
}

// Zod schema for structured output
const GradingResultSchema = z.object({
  score: z.number(),
  maxScore: z.number(),
  feedback: z.string(),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
});

export class WrittenQuestionsGradingService {
  private llm: ChatTogetherAI;

  constructor() {
    this.llm = new ChatTogetherAI({
      apiKey: env.TOGETHER_AI_API_KEY,
      model: env.SMART_LLM || env.FAST_LLM,
      temperature: 0.3, // Lower temperature for more consistent grading
    });
  }

  async gradeAnswer(request: GradingRequest): Promise<GradingResult> {
    const { question, userAnswer, referenceContext } = request;

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      service: 'WrittenQuestionsGrading',
      action: 'grade_answer',
      questionId: question.id,
      questionType: question.questionType,
      maxPoints: question.rubric.maxPoints,
      answerLength: userAnswer.length,
    }));

    const prompt = this.buildGradingPrompt(question, userAnswer, referenceContext);

    try {
      const response = await invokeWithRetry(
        () => invokeWithTimeout(
          () => this.llm.invoke([
            new SystemMessage('You are an expert educator providing fair, constructive feedback on student answers.'),
            new HumanMessage(prompt),
          ]),
          120000, // 2 minute timeout for grading
          'WrittenQuestionsGrading'
        ),
        {
          maxAttempts: 2,
          baseDelayMs: 1000,
        },
        'WrittenQuestionsGrading'
      );

      const output = response.content.toString();

      // Parse the structured output
      const result = this.parseGradingOutput(output, question.rubric.maxPoints);

      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        service: 'WrittenQuestionsGrading',
        action: 'grade_complete',
        questionId: question.id,
        score: result.score,
        maxScore: result.maxScore,
        percentage: Math.round((result.score / result.maxScore) * 100),
      }));

      return result;
    } catch (error) {
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        service: 'WrittenQuestionsGrading',
        action: 'grade_error',
        questionId: question.id,
        error: error instanceof Error ? error.message : String(error),
      }));

      // Fallback result on error
      return this.getFallbackResult(question);
    }
  }

  private buildGradingPrompt(question: WrittenQuestion, userAnswer: string, referenceContext?: string): string {
    const { question: questionText, questionType, rubric, modelAnswer } = question;

    const typeGuidance = questionType === 'short'
      ? 'Short Answer: 1-3 sentences expected, testing recall and basic understanding'
      : 'Essay: Multi-paragraph response expected, testing analysis and synthesis';

    return `You are grading a ${questionType} answer.

**QUESTION:**
${questionText}

**TYPE:** ${typeGuidance}

**MAX POINTS:** ${rubric.maxPoints}

**GRADING RUBRIC:**
${rubric.criteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}

**STUDENT ANSWER:**
${userAnswer}

${modelAnswer ? `**REFERENCE ANSWER (for guidance):**\n${modelAnswer}\n` : ''}
${referenceContext ? `**REFERENCE MATERIAL:**\n${referenceContext}\n` : ''}

**GRADING INSTRUCTIONS:**
1. Score the answer out of ${rubric.maxPoints} points
2. Provide detailed, constructive feedback
3. List specific strengths (what was done well)
4. List specific areas for improvement (what could be better)

Be fair, constructive, and educational in your feedback.

**OUTPUT FORMAT (JSON):**
{
  "score": <number 0-${rubric.maxPoints}>,
  "maxScore": ${rubric.maxPoints},
  "feedback": "<detailed explanation of the score and feedback>",
  "strengths": ["<strength 1>", "<strength 2>", ...],
  "improvements": ["<improvement 1>", "<improvement 2>", ...]
}

**IMPORTANT:** Output ONLY the JSON object, nothing else.`;
  }

  private parseGradingOutput(output: string, maxPoints: number): GradingResult {
    try {
      // Try to extract JSON from the output
      const jsonMatch = output.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON object found in output');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate with Zod schema
      const validated = GradingResultSchema.parse(parsed);

      return {
        score: Math.min(validated.score, maxPoints),
        maxScore: validated.maxScore,
        feedback: validated.feedback,
        strengths: validated.strengths || [],
        improvements: validated.improvements || [],
      };
    } catch (error) {
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        service: 'WrittenQuestionsGrading',
        action: 'parse_error',
        error: error instanceof Error ? error.message : String(error),
        outputLength: output.length,
        outputPreview: output.substring(0, 200),
      }));

      throw error;
    }
  }

  private getFallbackResult(question: WrittenQuestion): GradingResult {
    return {
      score: Math.floor(question.rubric.maxPoints / 2),
      maxScore: question.rubric.maxPoints,
      feedback: 'We were unable to grade your answer due to a technical issue. Please try again or contact support.',
      strengths: [],
      improvements: ['Please submit again for proper grading'],
    };
  }
}
