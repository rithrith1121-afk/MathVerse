/**
 * RetryManager — Exponential backoff retry logic for AI requests.
 * Retries on transient failures with jitter to avoid thundering herd.
 */

import { MAX_RETRY_ATTEMPTS } from './models.config';
import { classifyError, MathVerseError } from './ErrorHandler';
import { aiLog } from './AILogger';

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
}

const DEFAULT_BASE_DELAY_MS = 1000;

/** Sleep utility */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Calculate delay with exponential backoff + jitter */
function calcDelay(attempt: number, baseMs: number): number {
  const exponential = baseMs * Math.pow(2, attempt);
  const jitter = Math.random() * 200; // up to 200ms jitter
  return exponential + jitter;
}

/**
 * Wraps an async operation with exponential backoff retries.
 * The callback receives the current attempt number (0-indexed).
 * Throws a MathVerseError after all attempts are exhausted.
 */
export async function withRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? MAX_RETRY_ATTEMPTS;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;

  let lastError: MathVerseError | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      const delay = calcDelay(attempt - 1, baseDelayMs);
      aiLog('RETRY', `Attempt ${attempt + 1}/${maxAttempts} — waiting ${Math.round(delay)}ms`);
      await sleep(delay);
    }

    try {
      aiLog('REQUEST', `Attempt ${attempt + 1}/${maxAttempts} starting`);
      const result = await operation(attempt);
      return result;
    } catch (err: unknown) {
      const classified = classifyError(err);
      lastError = classified;

      if (attempt === maxAttempts - 1) {
        aiLog('ERROR', `All ${maxAttempts} attempts failed — ${classified.code}`);
        break;
      }

      if (!classified.retryable) {
        aiLog('ERROR', `Non-retryable error — ${classified.code} — aborting retry`);
        break;
      }

      aiLog('WARN', `Attempt ${attempt + 1} failed (${classified.code}) — will retry`);
    }
  }

  throw lastError ?? classifyError(new Error('Unknown retry failure'));
}
