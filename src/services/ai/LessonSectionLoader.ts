/**
 * LessonSectionLoader — Independent, cached API calls for each lesson section.
 *
 * Architecture:
 *   Component calls loadSection(topic, level, sectionName)
 *     → Cache check (localStorage)
 *     → On miss: AIManager.runSection(sectionName)
 *     → Retry via RetryManager (already inside AIManager)
 *     → Validate response
 *     → Cache result
 *     → Return typed data
 *
 * NEVER throws a raw Error — always returns { data } or { error }
 * so the component can display a retry button without crashing.
 */

import { groqProvider } from './GroqProvider';
import { TEXT_MODEL_CHAIN } from './models.config';
import { withRetry } from './RetryManager';
import { classifyError, MathVerseError, formatUserError } from './ErrorHandler';
import { parseJsonResponse } from './ResponseFormatter';
import { cacheSection, readCachedSection } from './LessonCache';
import { aiLog } from './AILogger';
import {
  buildConceptPrompt,
  buildFormulasPrompt,
  buildExamplesPrompt,
  buildPracticePrompt,
  buildQuizPrompt,
  buildChallengePrompt,
  buildSummaryPrompt,
  buildAnswerCheckPrompt,
  ConceptSection,
  FormulasSection,
  ExamplesSection,
  PracticeSection,
  QuizSection,
  ChallengeSection,
  SummarySection,
  AnswerCheckResult,
  SectionPrompt,
} from './LessonPromptBuilder';

// ── Internal runner ──────────────────────────────────────────────────────────

async function runSectionRequest<T>(
  prompt: SectionPrompt,
  sectionName: string,
  fallback: T
): Promise<SectionLoadResult<T>> {
  let lastError: MathVerseError | null = null;

  for (const model of TEXT_MODEL_CHAIN) {
    try {
      aiLog('REQUEST', `[${sectionName}] Trying model: ${model.id}`);
      const start = Date.now();

      const result = await withRetry(
        () =>
          groqProvider.complete({
            modelId: model.id,
            messages: [
              { role: 'system', content: prompt.system },
              { role: 'user', content: prompt.user },
            ],
            temperature: 0.05,
            maxTokens: Math.min(model.maxTokens, 2048),
            responseFormat: 'json_object',
          }),
        { maxAttempts: 2 }
      );

      aiLog('RESPONSE', `[${sectionName}] ${model.id} responded in ${Date.now() - start}ms`);

      // Validate and parse
      const parsed = parseJsonResponse<T>(result.text, fallback);

      // Sanity check: parsed shouldn't equal the fallback entirely
      if (!parsed || (typeof parsed === 'object' && Object.keys(parsed as object).length === 0)) {
        throw new Error(`Empty JSON response from ${model.id}`);
      }

      return { data: parsed };
    } catch (err: unknown) {
      const classified =
        err && typeof err === 'object' && 'code' in err
          ? (err as MathVerseError)
          : classifyError(err);
      lastError = classified;
      aiLog('WARN', `[${sectionName}] Model ${model.id} failed — ${classified.code}`);
      if (!classified.shouldFallback) break;
    }
  }

  return {
    error: formatUserError(
      lastError ?? classifyError(new Error(`All models failed for section: ${sectionName}`))
    ),
  };
}

// ── Result type ──────────────────────────────────────────────────────────────

export interface SectionLoadResult<T> {
  data?: T;
  error?: string;
}

// ── Public loaders ───────────────────────────────────────────────────────────

export async function loadConceptSection(
  topic: string,
  level: string,
  forceRefresh = false
): Promise<SectionLoadResult<ConceptSection>> {
  if (!forceRefresh) {
    const cached = readCachedSection<ConceptSection>(topic, level, 'concept');
    if (cached) return { data: cached };
  }

  const result = await runSectionRequest<ConceptSection>(
    buildConceptPrompt(topic, level),
    'concept',
    { introduction: '', whyImportant: '', applications: '', basicConcepts: '' }
  );

  if (result.data) cacheSection(topic, level, 'concept', result.data);
  return result;
}

export async function loadFormulasSection(
  topic: string,
  level: string,
  forceRefresh = false
): Promise<SectionLoadResult<FormulasSection>> {
  if (!forceRefresh) {
    const cached = readCachedSection<FormulasSection>(topic, level, 'formulas');
    if (cached) return { data: cached };
  }

  const result = await runSectionRequest<FormulasSection>(
    buildFormulasPrompt(topic, level),
    'formulas',
    { definitions: '', formulas: [], derivations: '' }
  );

  if (result.data) cacheSection(topic, level, 'formulas', result.data);
  return result;
}

export async function loadExamplesSection(
  topic: string,
  level: string,
  forceRefresh = false
): Promise<SectionLoadResult<ExamplesSection>> {
  if (!forceRefresh) {
    const cached = readCachedSection<ExamplesSection>(topic, level, 'examples');
    if (cached) return { data: cached };
  }

  const result = await runSectionRequest<ExamplesSection>(
    buildExamplesPrompt(topic, level),
    'examples',
    {
      beginnerExample: { title: '', question: '', steps: [], finalAnswer: '' },
      mediumExample: { title: '', question: '', steps: [], finalAnswer: '' },
      engineeringExample: { title: '', question: '', steps: [], finalAnswer: '' },
      commonMistakes: '',
      shortTricks: '',
      examTips: '',
    }
  );

  if (result.data) cacheSection(topic, level, 'examples', result.data);
  return result;
}

export async function loadPracticeSection(
  topic: string,
  level: string,
  previousMistakes?: string[]
): Promise<SectionLoadResult<PracticeSection>> {
  // Practice is NOT cached — always fresh so students get new questions
  return runSectionRequest<PracticeSection>(
    buildPracticePrompt(topic, level, previousMistakes),
    'practice',
    { question: '', correctAnswer: '', hint: '' }
  );
}

export async function loadQuizSection(
  topic: string,
  level: string,
  forceRefresh = false
): Promise<SectionLoadResult<QuizSection>> {
  if (!forceRefresh) {
    const cached = readCachedSection<QuizSection>(topic, level, 'quiz');
    if (cached) return { data: cached };
  }

  const result = await runSectionRequest<QuizSection>(
    buildQuizPrompt(topic, level),
    'quiz',
    { questions: [] }
  );

  if (result.data) cacheSection(topic, level, 'quiz', result.data);
  return result;
}

export async function loadChallengeSection(
  topic: string,
  level: string,
  forceRefresh = false
): Promise<SectionLoadResult<ChallengeSection>> {
  if (!forceRefresh) {
    const cached = readCachedSection<ChallengeSection>(topic, level, 'challenge');
    if (cached) return { data: cached };
  }

  const result = await runSectionRequest<ChallengeSection>(
    buildChallengePrompt(topic, level),
    'challenge',
    { question: '', hint: '', correctAnswer: '', explanation: '' }
  );

  if (result.data) cacheSection(topic, level, 'challenge', result.data);
  return result;
}

export async function loadSummarySection(
  topic: string,
  level: string,
  forceRefresh = false
): Promise<SectionLoadResult<SummarySection>> {
  if (!forceRefresh) {
    const cached = readCachedSection<SummarySection>(topic, level, 'summary');
    if (cached) return { data: cached };
  }

  const result = await runSectionRequest<SummarySection>(
    buildSummaryPrompt(topic, level),
    'summary',
    { summary: '', keyFormulas: '', nextTopic: '' }
  );

  if (result.data) cacheSection(topic, level, 'summary', result.data);
  return result;
}

export async function checkStudentAnswerSection(
  topic: string,
  question: string,
  studentAnswer: string,
  correctAnswer: string
): Promise<SectionLoadResult<AnswerCheckResult>> {
  return runSectionRequest<AnswerCheckResult>(
    buildAnswerCheckPrompt(topic, question, studentAnswer, correctAnswer),
    'answer-check',
    { isCorrect: false, explanation: 'Unable to evaluate answer. Please try again.' }
  );
}
