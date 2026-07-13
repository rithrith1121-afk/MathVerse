/**
 * aiService.ts — Backwards-compatible façade.
 *
 * All actual AI logic lives in src/services/ai/AIManager.ts.
 * This file exists purely so that existing imports continue working
 * without touching every component that uses the old API.
 *
 * DO NOT add new AI logic here. Add it in AIManager.ts.
 */

import { solveMath, solveImage } from './ai/AIManager';
import { formatUserError } from './ai/ErrorHandler';
import type { MathVerseError } from './ai/ErrorHandler';

/**
 * Generate a step-by-step math solution from text input.
 * Returns formatted HTML string.
 */
export const generateMathSolution = async (
  question: string,
  level: string,
  learningMode?: string
): Promise<string> => {
  if (!question.trim()) {
    throw new Error('Question cannot be empty');
  }

  try {
    const result = await solveMath(question, level, learningMode);
    return result.raw; // Components using old API get raw text for their own rendering
  } catch (err: unknown) {
    const msg = err && typeof err === 'object' && 'userMessage' in err
      ? formatUserError(err as MathVerseError)
      : 'MathVerse AI is temporarily unavailable.';
    return msg;
  }
};

/**
 * Solve a math problem from an uploaded image file.
 * Returns the raw text response (components render it themselves).
 */
export const solveMathFromImage = async (
  imageFile: File,
  level?: string,
  learningMode?: string,
  additionalText?: string
): Promise<string> => {
  try {
    const result = await solveImage({
      file: imageFile,
      level: level || 'standard',
      learningMode,
      additionalText,
    });
    // ImageSolver returns HTML; for old API callers return it directly
    return result.html;
  } catch (err: unknown) {
    const msg = err && typeof err === 'object' && 'userMessage' in err
      ? formatUserError(err as MathVerseError)
      : 'Image solving model is currently unavailable. Please try text input.';
    return msg;
  }
};

/** Alias kept for backwards compatibility */
export const solveTextMathProblem = generateMathSolution;
