/**
 * ErrorHandler — Maps raw API/network errors to user-friendly MathVerse messages.
 * Never expose stack traces or raw JSON to the user.
 */

export interface MathVerseError {
  code: ErrorCode;
  userMessage: string;
  developerMessage: string;
  retryable: boolean;
  shouldFallback: boolean;
}

export type ErrorCode =
  | 'INVALID_API_KEY'
  | 'RATE_LIMIT_EXCEEDED'
  | 'MODEL_UNAVAILABLE'
  | 'SERVER_BUSY'
  | 'NO_INTERNET'
  | 'REQUEST_TIMEOUT'
  | 'CONTEXT_TOO_LONG'
  | 'GROQ_UNAVAILABLE'
  | 'UNKNOWN_AI_ERROR';

const ERROR_MAP: Record<number, Omit<MathVerseError, 'developerMessage'>> = {
  401: {
    code: 'INVALID_API_KEY',
    userMessage: 'The AI service API key is invalid or expired. Please check your configuration.',
    retryable: false,
    shouldFallback: false,
  },
  403: {
    code: 'INVALID_API_KEY',
    userMessage: 'Access to the AI service was denied. Please verify your API key permissions.',
    retryable: false,
    shouldFallback: false,
  },
  404: {
    code: 'MODEL_UNAVAILABLE',
    userMessage: 'The selected AI model is not available. Switching to an alternative model.',
    retryable: false,
    shouldFallback: true,
  },
  429: {
    code: 'RATE_LIMIT_EXCEEDED',
    userMessage: 'Rate limit exceeded. MathVerse is retrying with a brief pause.',
    retryable: true,
    shouldFallback: true,
  },
  400: {
    code: 'MODEL_UNAVAILABLE',
    userMessage: 'The AI model returned an invalid response. Switching to an alternative model.',
    retryable: false,
    shouldFallback: true,
  },
  500: {
    code: 'SERVER_BUSY',
    userMessage: 'The AI server is temporarily busy. Retrying automatically.',
    retryable: true,
    shouldFallback: true,
  },
  502: {
    code: 'GROQ_UNAVAILABLE',
    userMessage: 'Groq AI service is temporarily unreachable. Please try again shortly.',
    retryable: true,
    shouldFallback: true,
  },
  503: {
    code: 'SERVER_BUSY',
    userMessage: 'The AI service is temporarily unavailable. Retrying automatically.',
    retryable: true,
    shouldFallback: true,
  },
};

/** Parse an HTTP status code or error into a structured MathVerseError */
export function classifyError(err: unknown, statusCode?: number): MathVerseError {
  // Timeout
  if (err instanceof DOMException && err.name === 'AbortError') {
    return {
      code: 'REQUEST_TIMEOUT',
      userMessage: 'The AI request timed out after 30 seconds. Please try again.',
      developerMessage: 'AbortController timeout triggered',
      retryable: true,
      shouldFallback: false,
    };
  }

  // Network failure
  if (err instanceof TypeError && (err.message.includes('fetch') || err.message.includes('network'))) {
    return {
      code: 'NO_INTERNET',
      userMessage: 'Cannot reach the AI service. Please check your internet connection.',
      developerMessage: err.message,
      retryable: false,
      shouldFallback: false,
    };
  }

  // HTTP status code mapping
  if (statusCode && ERROR_MAP[statusCode]) {
    const mapped = ERROR_MAP[statusCode];
    return {
      ...mapped,
      developerMessage: `HTTP ${statusCode}`,
    };
  }

  // Check error message for decommissioned model signals
  const errMsg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  if (
    errMsg.includes('decommissioned') ||
    errMsg.includes('deprecated') ||
    errMsg.includes('no longer available') ||
    errMsg.includes('model_not_found')
  ) {
    return {
      code: 'MODEL_UNAVAILABLE',
      userMessage: 'The AI model is no longer available. Switching to an alternative model.',
      developerMessage: errMsg,
      retryable: false,
      shouldFallback: true,
    };
  }

  if (errMsg.includes('context') && errMsg.includes('length')) {
    return {
      code: 'CONTEXT_TOO_LONG',
      userMessage: 'The problem is too long for the AI to process. Please shorten your input.',
      developerMessage: errMsg,
      retryable: false,
      shouldFallback: false,
    };
  }

  // Default unknown
  return {
    code: 'UNKNOWN_AI_ERROR',
    userMessage: 'MathVerse AI encountered an unexpected error. Please try again.',
    developerMessage: err instanceof Error ? err.message : String(err),
    retryable: true,
    shouldFallback: true,
  };
}

/** Format MathVerseError for display in the UI */
export function formatUserError(error: MathVerseError): string {
  return error.userMessage;
}
