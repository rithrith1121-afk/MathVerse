/**
 * ImageSolver — Orchestrates the image-to-solution pipeline.
 *
 * Flow:
 *   Input File
 *     → validateImageFile
 *     → preprocessImage (OCR enhancement)
 *     → fileToBase64
 *     → AIManager.solveWithImage (vision model chain)
 *     → ResponseFormatter
 */

import { validateImageFile, preprocessImage, fileToBase64 } from './OCRService';
import { buildImageSolvePrompts } from './PromptBuilder';
import { formatResponse } from './ResponseFormatter';
import { classifyError, formatUserError, MathVerseError } from './ErrorHandler';
import { VISION_MODEL_CHAIN } from './models.config';
import { groqProvider } from './GroqProvider';
import { withRetry } from './RetryManager';
import { aiLog } from './AILogger';

export interface ImageSolveOptions {
  file: File;
  level: string;
  learningMode?: string;
  additionalText?: string;
  onProgress?: (stage: 'validating' | 'preprocessing' | 'sending' | 'formatting') => void;
}

export interface ImageSolveResult {
  html: string;
  modelUsed: string;
  durationMs: number;
}

export async function solveImageProblem(options: ImageSolveOptions): Promise<ImageSolveResult> {
  const { file, level, learningMode, additionalText, onProgress } = options;

  // Stage 1: Validate
  onProgress?.('validating');
  const validation = validateImageFile(file);
  if (!validation.valid) {
    throw classifyError(new Error(validation.error ?? 'Invalid image'));
  }

  // Stage 2: OCR Preprocessing
  onProgress?.('preprocessing');
  aiLog('INFO', 'Starting OCR preprocessing');
  let processedFile: File;
  try {
    processedFile = await preprocessImage(file, { contrast: 1.6, threshold: 140 });
  } catch {
    aiLog('WARN', 'OCR preprocessing failed — using original file');
    processedFile = file;
  }

  // Stage 3: Convert to base64
  const base64 = await fileToBase64(processedFile);
  const mimeType = processedFile.type || 'image/png';
  const dataUrl = `data:${mimeType};base64,${base64}`;

  // Stage 4: Build prompts
  const { system, user } = buildImageSolvePrompts(level, learningMode, additionalText);

  // Stage 5: Send to vision model chain with fallback
  onProgress?.('sending');
  aiLog('INFO', `Sending image to vision model chain (${VISION_MODEL_CHAIN.length} models)`);

  let lastError: MathVerseError | null = null;
  let result: { text: string; modelUsed: string; durationMs: number } | null = null;

  for (const model of VISION_MODEL_CHAIN) {
    if (!model.supportsVision) continue;

    try {
      aiLog('MODEL', `Trying vision model: ${model.id}`);
      const completion = await withRetry(
        () =>
          groqProvider.complete({
            modelId: model.id,
            messages: [
              { role: 'system', content: system },
              {
                role: 'user',
                content: [
                  {
                    type: 'image_url',
                    image_url: { url: dataUrl },
                  },
                  { type: 'text', text: user },
                ],
              },
            ],
          }),
        { maxAttempts: 2 }
      );
      result = completion;
      aiLog('INFO', `Vision model ${model.id} succeeded`);
      break;
    } catch (err: unknown) {
      const classified =
        err && typeof err === 'object' && 'code' in err
          ? (err as MathVerseError)
          : classifyError(err);

      lastError = classified;
      aiLog('WARN', `Vision model ${model.id} failed — ${classified.code}`);

      if (!classified.shouldFallback) break;
    }
  }

  if (!result) {
    throw lastError ?? classifyError(new Error('All vision models exhausted'));
  }

  // Stage 6: Format response
  onProgress?.('formatting');
  const html = formatResponse(result.text);

  return {
    html,
    modelUsed: result.modelUsed,
    durationMs: result.durationMs,
  };
}
