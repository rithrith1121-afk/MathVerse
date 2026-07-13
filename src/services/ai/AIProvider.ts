/**
 * AIProvider — Abstract interface for AI backend implementations.
 * Any provider (Groq, OpenAI, Anthropic, etc.) must implement this contract.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentPart[];
}

export interface ContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}

export interface CompletionOptions {
  messages: ChatMessage[];
  modelId: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  signal?: AbortSignal;
  responseFormat?: 'text' | 'json_object';
}

export interface CompletionResult {
  text: string;
  modelUsed: string;
  durationMs: number;
}

export interface StreamChunk {
  delta: string;
  done: boolean;
}

export interface AIProvider {
  /** Send a chat completion request and return the full text. */
  complete(options: CompletionOptions): Promise<CompletionResult>;

  /** Stream a chat completion, calling onChunk for each token delta. */
  stream(
    options: CompletionOptions,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<CompletionResult>;

  /** Verify the provider is reachable and the API key is valid. */
  healthCheck(): Promise<{ ok: boolean; latencyMs: number; error?: string }>;
}
