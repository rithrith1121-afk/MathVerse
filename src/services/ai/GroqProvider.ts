/**
 * GroqProvider — Concrete implementation of AIProvider for the Groq API.
 * Handles authentication, HTTP requests, model fallback, and streaming.
 */

import type { AIProvider, CompletionOptions, CompletionResult, StreamChunk } from './AIProvider';
import type { ChatMessage } from './AIProvider';
import { GROQ_API_ENDPOINT, FALLBACK_STATUS_CODES, REQUEST_TIMEOUT_MS } from './models.config';
import { classifyError } from './ErrorHandler';
import { openStream } from './StreamingService';
import { aiLog, aiError } from './AILogger';

function getApiKey(): string {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return import.meta.env.VITE_GROQ_API_KEY || '';
  }
  return '';
}

function buildHeaders(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  };
}

function buildRequestBody(options: CompletionOptions, stream = false): string {
  const body: Record<string, unknown> = {
    model: options.modelId,
    messages: options.messages,
    temperature: options.temperature ?? 0.1,
    stream,
  };
  if (options.maxTokens) body.max_tokens = options.maxTokens;
  if (options.responseFormat === 'json_object') {
    body.response_format = { type: 'json_object' };
  }
  return JSON.stringify(body);
}

export class GroqProvider implements AIProvider {
  private readonly endpoint = GROQ_API_ENDPOINT;

  async complete(options: CompletionOptions): Promise<CompletionResult> {
    const apiKey = getApiKey();
    if (!apiKey) {
      throw classifyError(new Error('Missing API key'));
    }

    const startTime = Date.now();
    const controller = options.signal
      ? null // Use caller-provided signal
      : new AbortController();

    const signal = options.signal ?? controller!.signal;

    // Set timeout if we own the AbortController
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    if (controller) {
      timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    }

    try {
      const url = `${this.endpoint}/chat/completions`;
      const headers = buildHeaders(apiKey);
      const body = buildRequestBody(options);

      aiLog('MODEL', `Requesting model: ${options.modelId}`);

      const response = await fetch(url, { method: 'POST', headers, body, signal });

      if (!response.ok) {
        const statusCode = response.status;
        let errorBody = '';
        try { errorBody = await response.text(); } catch { /* ignore */ }

        aiLog('ERROR', `HTTP ${statusCode} from Groq — model ${options.modelId}`);

        const structured = classifyError(new Error(errorBody), statusCode);
        throw structured;
      }

      const data = await response.json();
      const text = data?.choices?.[0]?.message?.content ?? '';
      const durationMs = Date.now() - startTime;

      aiLog('RESPONSE', `Model ${options.modelId} responded in ${durationMs}ms`);

      return { text, modelUsed: options.modelId, durationMs };
    } catch (err: unknown) {
      // If already a classified MathVerseError, rethrow
      if (err && typeof err === 'object' && 'code' in err && 'userMessage' in err) {
        throw err;
      }
      throw classifyError(err, undefined);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  async stream(
    options: CompletionOptions,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<CompletionResult> {
    const apiKey = getApiKey();
    if (!apiKey) throw classifyError(new Error('Missing API key'));

    const startTime = Date.now();
    const controller = new AbortController();
    const signal = options.signal
      ? (() => {
          // Chain signals: abort if either fires
          options.signal.addEventListener('abort', () => controller.abort());
          return controller.signal;
        })()
      : controller.signal;

    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    return new Promise<CompletionResult>((resolve, reject) => {
      const url = `${this.endpoint}/chat/completions`;
      const headers = buildHeaders(apiKey);
      const body = buildRequestBody(options, true);

      aiLog('STREAM', `Starting stream for model ${options.modelId}`);

      let fullText = '';

      openStream({
        url,
        headers,
        body,
        signal,
        onChunk: (delta) => {
          fullText += delta;
          onChunk({ delta, done: false });
        },
        onComplete: (text) => {
          clearTimeout(timeoutId);
          onChunk({ delta: '', done: true });
          const durationMs = Date.now() - startTime;
          aiLog('RESPONSE', `Stream completed in ${durationMs}ms`);
          resolve({ text, modelUsed: options.modelId, durationMs });
        },
        onError: (err) => {
          clearTimeout(timeoutId);
          aiError('Stream error', err);
          reject(classifyError(err));
        },
      });
    });
  }

  async healthCheck(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const apiKey = getApiKey();
    if (!apiKey) {
      return { ok: false, latencyMs: 0, error: 'API key is missing' };
    }

    const start = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(`${this.endpoint}/models`, {
        headers: buildHeaders(apiKey),
        signal: controller.signal,
      });

      clearTimeout(timeout);
      const latencyMs = Date.now() - start;

      if (!response.ok) {
        return { ok: false, latencyMs, error: `HTTP ${response.status}` };
      }

      return { ok: true, latencyMs };
    } catch (err) {
      clearTimeout(timeout);
      const latencyMs = Date.now() - start;
      const msg = err instanceof Error ? err.message : 'Unknown error';
      return { ok: false, latencyMs, error: msg };
    }
  }
}

/** Singleton instance */
export const groqProvider = new GroqProvider();
