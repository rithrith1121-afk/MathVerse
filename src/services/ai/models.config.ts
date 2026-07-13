/**
 * MathVerse AI Model Registry
 * ─────────────────────────────────────────────────────────────────────────────
 * All model names are defined here. NEVER hardcode model strings anywhere else.
 * Modify this file to switch, add, or retire models.
 */

export interface ModelConfig {
  id: string;
  name: string;
  description: string;
  supportsVision: boolean;
  supportsStreaming: boolean;
  maxTokens: number;
}

export const MODEL_REGISTRY: Record<string, ModelConfig> = {
  PRIMARY: {
    id: 'llama-3.3-70b-versatile',
    name: 'Llama 3.3 70B Versatile',
    description: 'Primary text reasoning model',
    supportsVision: false,
    supportsStreaming: true,
    maxTokens: 8192,
  },
  FALLBACK: {
    id: 'openai/gpt-oss-120b',
    name: 'GPT OSS 120B',
    description: 'Fallback text reasoning model',
    supportsVision: false,
    supportsStreaming: true,
    maxTokens: 8192,
  },
  FALLBACK_2: {
    id: 'mixtral-8x7b-32768',
    name: 'Mixtral 8x7B',
    description: 'Second fallback text model',
    supportsVision: false,
    supportsStreaming: true,
    maxTokens: 32768,
  },
  VISION_PRIMARY: {
    id: 'meta-llama/llama-4-scout-17b-16e-instruct',
    name: 'Llama 4 Scout 17B Vision',
    description: 'Primary vision model for image solving',
    supportsVision: true,
    supportsStreaming: false,
    maxTokens: 8192,
  },
  VISION_FALLBACK: {
    id: 'llama-3.2-90b-vision-preview',
    name: 'Llama 3.2 90B Vision Preview',
    description: 'Fallback vision model',
    supportsVision: true,
    supportsStreaming: false,
    maxTokens: 4096,
  },
  VISION_FALLBACK_2: {
    id: 'llama-3.2-11b-vision-preview',
    name: 'Llama 3.2 11B Vision Preview',
    description: 'Second fallback vision model',
    supportsVision: true,
    supportsStreaming: false,
    maxTokens: 4096,
  },
};

/** Ordered list of text models to attempt, primary first */
export const TEXT_MODEL_CHAIN: ModelConfig[] = [
  MODEL_REGISTRY.PRIMARY,
  MODEL_REGISTRY.FALLBACK,
  MODEL_REGISTRY.FALLBACK_2,
];

/** Ordered list of vision models to attempt, primary first */
export const VISION_MODEL_CHAIN: ModelConfig[] = [
  MODEL_REGISTRY.VISION_PRIMARY,
  MODEL_REGISTRY.VISION_FALLBACK,
  MODEL_REGISTRY.VISION_FALLBACK_2,
];

/** API endpoint */
export const GROQ_API_ENDPOINT = 'https://api.groq.com/openai/v1';

/** Request timeout in milliseconds */
export const REQUEST_TIMEOUT_MS = 30_000;

/** Maximum retry attempts */
export const MAX_RETRY_ATTEMPTS = 3;

/** HTTP status codes that trigger model fallback */
export const FALLBACK_STATUS_CODES = new Set([400, 404, 429, 500, 503]);

/** HTTP status codes that trigger retry (not necessarily model fallback) */
export const RETRY_STATUS_CODES = new Set([429, 500, 502, 503, 504]);
