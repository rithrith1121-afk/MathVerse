/**
 * StreamingService — Handles Groq SSE streaming responses.
 * Decodes the Server-Sent Events buffer and emits token deltas.
 */

import { aiLog } from './AILogger';

export interface StreamOptions {
  url: string;
  headers: Record<string, string>;
  body: string;
  signal: AbortSignal;
  onChunk: (delta: string) => void;
  onComplete: (fullText: string) => void;
  onError: (err: unknown) => void;
}

/**
 * Open a Groq streaming chat completions request and process SSE chunks.
 * Calls onChunk for each token delta and onComplete with the full response.
 */
export async function openStream(options: StreamOptions): Promise<void> {
  const { url, headers, body, signal, onChunk, onComplete, onError } = options;

  aiLog('STREAM', 'Opening SSE stream');

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
      signal,
    });

    if (!response.ok) {
      throw Object.assign(new Error(`Stream HTTP ${response.status}`), { status: response.status });
    }

    if (!response.body) {
      throw new Error('Response body is null — streaming not supported');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let fullText = '';
    let buffer = '';

    aiLog('STREAM', 'SSE reader started');

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { value, done } = await reader.read();

      if (done) {
        aiLog('STREAM', 'SSE stream completed');
        onComplete(fullText);
        break;
      }

      // Decode incoming bytes and append to buffer
      buffer += decoder.decode(value, { stream: true });

      // Process complete lines from buffer
      const lines = buffer.split('\n');
      // Keep last (potentially incomplete) line in buffer
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();

        if (!trimmed || trimmed === 'data: [DONE]') {
          if (trimmed === 'data: [DONE]') {
            aiLog('STREAM', 'Received [DONE] signal');
            onComplete(fullText);
            return;
          }
          continue;
        }

        if (!trimmed.startsWith('data: ')) continue;

        const jsonStr = trimmed.slice(6); // Remove "data: " prefix
        try {
          const parsed = JSON.parse(jsonStr);
          const delta = parsed?.choices?.[0]?.delta?.content;
          if (delta) {
            fullText += delta;
            onChunk(delta);
          }
        } catch {
          // Skip malformed SSE lines silently
        }
      }
    }
  } catch (err: unknown) {
    aiLog('ERROR', 'Stream failed');
    onError(err);
  }
}
