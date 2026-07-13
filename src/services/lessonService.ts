/**
 * lessonService.ts — Lesson business logic + Supabase/localStorage sync.
 *
 * AI generation calls have been removed from this file and delegated to
 * src/services/ai/AIManager.ts. This file now only contains:
 *   - Data types (LessonProgress, AIMemory, LessonQuizQuestion)
 *   - Database operations (Supabase + localStorage fallback)
 *   - Thin AI call wrappers that forward to AIManager
 *
 * DO NOT put raw fetch() calls or API keys in this file.
 */

import { supabase } from '../lib/supabase';
import {
  teachTopicSection,
  generateQuiz,
  generatePracticeQuestion,
  checkAnswer,
  generateChallenge,
  askProfessor,
} from './ai/AIManager';
import { parseJsonResponse } from './ai/ResponseFormatter';

// ── Types ────────────────────────────────────────────────────────────────────

export interface LessonProgress {
  id?: string;
  user_id?: string;
  topic: string;
  level: string;
  completed_steps: string[];
  score: number;
  xp_earned: number;
  completion_percentage: number;
  updated_at?: string;
}

export interface AIMemory {
  user_id?: string;
  weak_topics: string[];
  strong_topics: string[];
  previous_mistakes: {
    topic: string;
    question: string;
    mistake: string;
    correction: string;
    date: string;
  }[];
  faq: {
    question: string;
    answer: string;
    date: string;
  }[];
  next_recommended_topic?: string;
}

export interface LessonQuizQuestion {
  id: number;
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
}

// ── AI Generation (forwarded to AIManager) ───────────────────────────────────

export async function fetchLessonConcept(topic: string, level: string): Promise<{
  introduction: string;
  whyImportant: string;
  applications: string;
  basicConcepts: string;
}> {
  const raw = await teachTopicSection(topic, level, 'concept');
  return parseJsonResponse(JSON.stringify(raw), {
    introduction: '',
    whyImportant: '',
    applications: '',
    basicConcepts: '',
  }) as { introduction: string; whyImportant: string; applications: string; basicConcepts: string };
}

export async function fetchLessonFormulas(topic: string, level: string): Promise<{
  definitions: string;
  formulas: { name: string; formula: string; variables: string; explanation: string }[];
  derivations: string;
}> {
  const raw = await teachTopicSection(topic, level, 'formulas');
  return parseJsonResponse(JSON.stringify(raw), {
    definitions: '',
    formulas: [],
    derivations: '',
  }) as { definitions: string; formulas: { name: string; formula: string; variables: string; explanation: string }[]; derivations: string };
}

import type { ExamplesSection } from './ai/LessonPromptBuilder';

export async function fetchLessonExamples(topic: string, level: string): Promise<ExamplesSection> {
  const raw = await teachTopicSection(topic, level, 'examples');
  return parseJsonResponse(JSON.stringify(raw), {
    beginnerExample: { title: '', question: '', steps: [], finalAnswer: '' },
    mediumExample: { title: '', question: '', steps: [], finalAnswer: '' },
    engineeringExample: { title: '', question: '', steps: [], finalAnswer: '' },
    commonMistakes: '',
    shortTricks: '',
    examTips: '',
  }) as ExamplesSection;
}

export async function generatePracticeQuestion_lesson(
  topic: string,
  level: string,
  previousMistakes?: string[]
): Promise<{ question: string; correctAnswer: string; hint: string }> {
  const raw = await generatePracticeQuestion(topic, level, previousMistakes);
  return parseJsonResponse(JSON.stringify(raw), { question: '', correctAnswer: '', hint: '' }) as { question: string; correctAnswer: string; hint: string };
}

export async function checkStudentAnswer(
  topic: string,
  question: string,
  studentAnswer: string,
  correctAnswer: string
): Promise<{
  isCorrect: boolean;
  explanation: string;
  newExample?: { question: string; correctAnswer: string; hint: string };
}> {
  const raw = await checkAnswer(topic, question, studentAnswer, correctAnswer);
  return parseJsonResponse(JSON.stringify(raw), { isCorrect: false, explanation: '' }) as {
    isCorrect: boolean;
    explanation: string;
    newExample?: { question: string; correctAnswer: string; hint: string };
  };
}

export async function fetchLessonSummary(topic: string, level: string): Promise<{
  summary: string;
  formulaRevision: string;
  examQuestions: string[];
  quickNotes: string;
  nextRecommendedTopic: string;
}> {
  // Use the general concept section + produce summary-style output
  const raw = await teachTopicSection(topic, level, 'concept');
  const parsed = parseJsonResponse(JSON.stringify(raw), {}) as Record<string, unknown>;

  return {
    summary: String(parsed.introduction ?? ''),
    formulaRevision: String(parsed.whyImportant ?? ''),
    examQuestions: [],
    quickNotes: String(parsed.basicConcepts ?? ''),
    nextRecommendedTopic: '',
  };
}

export async function fetchLessonQuiz(topic: string, level: string): Promise<LessonQuizQuestion[]> {
  const raw = await generateQuiz(topic, level);
  const parsed = parseJsonResponse(JSON.stringify(raw), { questions: [] }) as { questions: LessonQuizQuestion[] };
  return parsed.questions || [];
}

export async function fetchTopicChallenge(topic: string, level: string): Promise<{
  question: string;
  hint: string;
  correctAnswer: string;
  explanation: string;
}> {
  const raw = await generateChallenge(topic, level);
  return parseJsonResponse(JSON.stringify(raw), {
    question: '',
    hint: '',
    correctAnswer: '',
    explanation: '',
  }) as { question: string; hint: string; correctAnswer: string; explanation: string };
}

export async function askProfessorAboutTopic(
  topic: string,
  level: string,
  studentQuestion: string,
  chatHistory: { role: string; content: string }[]
): Promise<string> {
  const result = await askProfessor(topic, level, chatHistory, studentQuestion);
  return result.raw;
}

// Keep the original name exported for AILessonScreen that uses it directly
export { generatePracticeQuestion_lesson as generatePracticeQuestion };

// ── Database: Supabase + localStorage ────────────────────────────────────────

export async function loadLessonProgress(
  userId: string | null,
  topic: string,
  level: string
): Promise<LessonProgress> {
  if (userId) {
    try {
      const { data, error } = await supabase
        .from('lesson_progress')
        .select('*')
        .eq('user_id', userId)
        .eq('topic', topic)
        .eq('level', level)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        return {
          topic: data.topic,
          level: data.level,
          completed_steps: data.completed_steps || [],
          score: data.score || 0,
          xp_earned: data.xp_earned || 0,
          completion_percentage: data.completion_percentage || 0,
        };
      }
    } catch (e) {
      console.error('Supabase load progress failed, trying local cache', e);
    }
  }

  const cacheKey = `mathverse_progress_${topic}_${level}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try { return JSON.parse(cached); } catch { /* ignore */ }
  }

  return { topic, level, completed_steps: [], score: 0, xp_earned: 0, completion_percentage: 0 };
}

export async function saveLessonProgress(
  userId: string | null,
  progress: LessonProgress
): Promise<void> {
  const cacheKey = `mathverse_progress_${progress.topic}_${progress.level}`;
  localStorage.setItem(cacheKey, JSON.stringify(progress));

  if (userId) {
    try {
      const { error } = await supabase.from('lesson_progress').upsert(
        {
          user_id: userId,
          topic: progress.topic,
          level: progress.level,
          completed_steps: progress.completed_steps,
          score: progress.score,
          xp_earned: progress.xp_earned,
          completion_percentage: progress.completion_percentage,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,topic,level' }
      );
      if (error) throw error;
    } catch (e) {
      console.error('Failed to sync lesson progress to Supabase:', e);
    }
  }
}

export async function loadAllProgresses(userId: string | null): Promise<LessonProgress[]> {
  if (userId) {
    try {
      const { data, error } = await supabase
        .from('lesson_progress')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      if (data && data.length > 0) return data;
    } catch (e) {
      console.error('Failed to fetch progresses from Supabase:', e);
    }
  }

  const progresses: LessonProgress[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('mathverse_progress_')) {
      try {
        const item = localStorage.getItem(key);
        if (item) progresses.push(JSON.parse(item));
      } catch { /* ignore */ }
    }
  }
  return progresses;
}

export async function loadAIMemory(userId: string | null): Promise<AIMemory> {
  const defaultMemory: AIMemory = {
    weak_topics: [],
    strong_topics: [],
    previous_mistakes: [],
    faq: [],
  };

  if (userId) {
    try {
      const { data, error } = await supabase
        .from('ai_memory')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        return {
          weak_topics: data.weak_topics || [],
          strong_topics: data.strong_topics || [],
          previous_mistakes: data.previous_mistakes || [],
          faq: data.faq || [],
          next_recommended_topic: data.next_recommended_topic,
        };
      }
    } catch (e) {
      console.error('Supabase load memory failed, trying local cache', e);
    }
  }

  const cached = localStorage.getItem('mathverse_aimemory');
  if (cached) {
    try { return JSON.parse(cached); } catch { /* ignore */ }
  }
  return defaultMemory;
}

export async function saveAIMemory(userId: string | null, memory: AIMemory): Promise<void> {
  localStorage.setItem('mathverse_aimemory', JSON.stringify(memory));

  if (userId) {
    try {
      const { error } = await supabase.from('ai_memory').upsert({
        user_id: userId,
        weak_topics: memory.weak_topics,
        strong_topics: memory.strong_topics,
        previous_mistakes: memory.previous_mistakes,
        faq: memory.faq,
        next_recommended_topic: memory.next_recommended_topic,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    } catch (e) {
      console.error('Failed to sync AI Memory to Supabase:', e);
    }
  }
}
