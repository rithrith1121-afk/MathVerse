/**
 * AIManager — Central coordinator for all AI operations in MathVerse.
 *
 * Responsibilities:
 * - Text model chain fallback (PRIMARY → FALLBACK → FALLBACK_2)
 * - Vision model chain routing is handled by ImageSolver
 * - Streaming support with live UI callbacks
 * - Retry via RetryManager
 * - Error classification → MathVerseError
 * - Structured logging via AILogger
 *
 * ALL AI calls in the application MUST go through AIManager.
 * Never call groqProvider directly from components or other services.
 */

import { groqProvider } from './GroqProvider';
import { TEXT_MODEL_CHAIN } from './models.config';
import { withRetry } from './RetryManager';
import { classifyError, MathVerseError } from './ErrorHandler';
import { formatResponse, parseJsonResponse } from './ResponseFormatter';
import {
  buildSolveMathPrompts,
  buildTeachTopicPrompts,
  buildQuizPrompts,
  buildStudyPlanPrompts,
  buildPracticeQuestionPrompts,
  buildAnswerCheckPrompts,
  buildChallengePrompts,
  buildAskProfessorPrompts,
  buildExplainStepPrompts,
} from './PromptBuilder';
import { solveImageProblem, ImageSolveOptions, ImageSolveResult } from './ImageSolver';
import { aiLog } from './AILogger';
import type { StreamChunk } from './AIProvider';

// ── Types ────────────────────────────────────────────────────────────────────

export interface SolveTextResult {
  html: string;
  raw: string;
  modelUsed: string;
  durationMs: number;
}

export interface StreamingOptions {
  onChunk: (accumulated: string) => void;
  onComplete: (result: SolveTextResult) => void;
  onError: (error: MathVerseError) => void;
  signal?: AbortSignal;
}

// ── Internal: Text Model Chain ───────────────────────────────────────────────

async function runTextChain(
  buildPrompts: () => { system: string; user: string },
  responseFormat?: 'text' | 'json_object'
): Promise<{ text: string; modelUsed: string; durationMs: number }> {
  const { system, user } = buildPrompts();
  let lastError: MathVerseError | null = null;

  for (const model of TEXT_MODEL_CHAIN) {
    try {
      aiLog('MODEL', `Text chain trying: ${model.id}`);
      const result = await withRetry(
        () =>
          groqProvider.complete({
            modelId: model.id,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
            temperature: responseFormat === 'json_object' ? 0.05 : 0.1,
            maxTokens: model.maxTokens,
            responseFormat,
          }),
        { maxAttempts: 2 }
      );
      aiLog('MODEL', `Text chain succeeded: ${model.id}`);
      return result;
    } catch (err: unknown) {
      const classified =
        err && typeof err === 'object' && 'code' in err
          ? (err as MathVerseError)
          : classifyError(err);
      lastError = classified;
      aiLog('WARN', `Text chain model ${model.id} failed — ${classified.code}`);
      if (!classified.shouldFallback) break;
    }
  }

  throw lastError ?? classifyError(new Error('All text models exhausted'));
}

async function runStreamingChain(
  buildPrompts: () => { system: string; user: string },
  streamOpts: StreamingOptions
): Promise<void> {
  const { system, user } = buildPrompts();
  let accumulated = '';
  let lastError: MathVerseError | null = null;

  for (const model of TEXT_MODEL_CHAIN) {
    if (!model.supportsStreaming) continue;
    accumulated = '';

    try {
      aiLog('STREAM', `Stream chain trying: ${model.id}`);
      const result = await groqProvider.stream(
        {
          modelId: model.id,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          temperature: 0.1,
          maxTokens: model.maxTokens,
          stream: true,
          signal: streamOpts.signal,
        },
        (chunk: StreamChunk) => {
          if (!chunk.done) {
            accumulated += chunk.delta;
            streamOpts.onChunk(accumulated);
          }
        }
      );

      const html = formatResponse(result.text);
      streamOpts.onComplete({ html, raw: result.text, modelUsed: result.modelUsed, durationMs: result.durationMs });
      return;
    } catch (err: unknown) {
      const classified =
        err && typeof err === 'object' && 'code' in err
          ? (err as MathVerseError)
          : classifyError(err);
      lastError = classified;
      aiLog('WARN', `Stream chain model ${model.id} failed — ${classified.code}`);
      if (!classified.shouldFallback) break;
    }
  }

  streamOpts.onError(lastError ?? classifyError(new Error('All streaming models exhausted')));
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Solve a text math problem (non-streaming) */
export async function solveMath(
  problem: string,
  level: string,
  learningMode?: string
): Promise<SolveTextResult> {
  const result = await runTextChain(() => buildSolveMathPrompts(problem, level, learningMode));
  return { html: formatResponse(result.text), raw: result.text, modelUsed: result.modelUsed, durationMs: result.durationMs };
}

/** Solve a text math problem with streaming */
export function solveMathStreaming(
  problem: string,
  level: string,
  streamOpts: StreamingOptions,
  learningMode?: string
): void {
  runStreamingChain(() => buildSolveMathPrompts(problem, level, learningMode), streamOpts);
}

/** Solve a math problem from an image */
export async function solveImage(options: ImageSolveOptions): Promise<ImageSolveResult> {
  return solveImageProblem(options);
}

/** Teach a topic — returns a JSON section */
export async function teachTopicSection(
  topic: string,
  level: string,
  section: 'concept' | 'formulas' | 'examples'
): Promise<unknown> {
  const result = await runTextChain(
    () => buildTeachTopicPrompts(topic, level, section),
    'json_object'
  );
  return parseJsonResponse(result.text, {});
}

/** Generate a 3-question quiz */
export async function generateQuiz(
  topic: string,
  level: string
): Promise<unknown> {
  const result = await runTextChain(() => buildQuizPrompts(topic, level), 'json_object');
  return parseJsonResponse(result.text, { questions: [] });
}

/** Generate a 7-day study plan (markdown) */
export async function generateStudyPlan(
  weakTopics: string[],
  level: string
): Promise<SolveTextResult> {
  const result = await runTextChain(() => buildStudyPlanPrompts(weakTopics, level));
  return { html: formatResponse(result.text), raw: result.text, modelUsed: result.modelUsed, durationMs: result.durationMs };
}

/** Generate a practice question */
export async function generatePracticeQuestion(
  topic: string,
  level: string,
  previousMistakes?: string[]
): Promise<unknown> {
  const result = await runTextChain(
    () => buildPracticeQuestionPrompts(topic, level, previousMistakes),
    'json_object'
  );
  return parseJsonResponse(result.text, { question: '', correctAnswer: '', hint: '' });
}

/** Check a student's answer */
export async function checkAnswer(
  topic: string,
  question: string,
  studentAnswer: string,
  correctAnswer: string
): Promise<unknown> {
  const result = await runTextChain(
    () => buildAnswerCheckPrompts(topic, question, studentAnswer, correctAnswer),
    'json_object'
  );
  return parseJsonResponse(result.text, { isCorrect: false, explanation: '' });
}

/** Generate a challenge problem */
export async function generateChallenge(
  topic: string,
  level: string
): Promise<unknown> {
  const result = await runTextChain(() => buildChallengePrompts(topic, level), 'json_object');
  return parseJsonResponse(result.text, { question: '', hint: '', correctAnswer: '', explanation: '' });
}

/** Ask Professor Q&A with history */
export async function askProfessor(
  topic: string,
  level: string,
  chatHistory: { role: string; content: string }[],
  studentQuestion: string
): Promise<SolveTextResult> {
  const result = await runTextChain(() =>
    buildAskProfessorPrompts(topic, level, chatHistory, studentQuestion)
  );
  return { html: formatResponse(result.text), raw: result.text, modelUsed: result.modelUsed, durationMs: result.durationMs };
}

/** Explain a single step */
export async function explainStep(
  expression: string,
  level: string
): Promise<SolveTextResult> {
  const result = await runTextChain(() => buildExplainStepPrompts(expression, level));
  return { html: formatResponse(result.text), raw: result.text, modelUsed: result.modelUsed, durationMs: result.durationMs };
}

/** Ask professor with streaming */
export function askProfessorStreaming(
  topic: string,
  level: string,
  chatHistory: { role: string; content: string }[],
  studentQuestion: string,
  streamOpts: StreamingOptions
): void {
  runStreamingChain(
    () => buildAskProfessorPrompts(topic, level, chatHistory, studentQuestion),
    streamOpts
  );
}
