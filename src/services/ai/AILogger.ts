/**
 * AILogger — Structured console logging for the MathVerse AI layer.
 * In production: suppresses stack traces.
 * In development: full verbose output.
 */

export type LogLevel = 'REQUEST' | 'MODEL' | 'STREAM' | 'RETRY' | 'RESPONSE' | 'HEALTH' | 'CACHE' | 'ERROR' | 'WARN' | 'INFO';

const IS_DEV = typeof import.meta !== 'undefined' && import.meta.env?.DEV === true;

const LEVEL_COLORS: Record<LogLevel, string> = {
  REQUEST:  '#00d2ff',
  MODEL:    '#a78bfa',
  STREAM:   '#34d399',
  RETRY:    '#fbbf24',
  RESPONSE: '#6ee7b7',
  HEALTH:   '#38bdf8',
  CACHE:    '#f472b6',
  ERROR:    '#f87171',
  WARN:     '#fb923c',
  INFO:     '#94a3b8',
};

/** Emit a structured [AI] log line */
export function aiLog(level: LogLevel, message: string, data?: unknown): void {
  const tag = `%c[AI][${level}]`;
  const style = `color:${LEVEL_COLORS[level]};font-weight:bold`;
  const ts = new Date().toISOString().split('T')[1].slice(0, 12);

  if (data !== undefined && IS_DEV) {
    console.log(`${tag}%c ${ts} — ${message}`, style, 'color:#94a3b8', data);
  } else {
    console.log(`${tag}%c ${ts} — ${message}`, style, 'color:#94a3b8');
  }
}

/** Only print full stack traces in development */
export function aiError(message: string, err: unknown): void {
  if (IS_DEV) {
    console.error(`%c[AI][ERROR]%c ${message}`, 'color:#f87171;font-weight:bold', 'color:#94a3b8', err);
  } else {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`%c[AI][ERROR]%c ${message}: ${msg}`, 'color:#f87171;font-weight:bold', 'color:#94a3b8');
  }
}
