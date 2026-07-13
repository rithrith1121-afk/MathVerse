/**
 * HealthChecker — Runs startup health checks for AI provider availability.
 * Exports a reactive status object to show UI-level indicator.
 */

import { groqProvider } from './GroqProvider';
import { aiLog } from './AILogger';

export type HealthStatus = 'unknown' | 'checking' | 'healthy' | 'degraded' | 'offline';

export interface HealthReport {
  status: HealthStatus;
  latencyMs: number | null;
  checkedAt: Date | null;
  error?: string;
}

/** Internal mutable state */
let currentReport: HealthReport = {
  status: 'unknown',
  latencyMs: null,
  checkedAt: null,
};

/** Listeners subscribed to health state changes */
const listeners: Array<(report: HealthReport) => void> = [];

function notify(): void {
  listeners.forEach(fn => fn({ ...currentReport }));
}

/** Subscribe to health updates */
export function onHealthChange(fn: (report: HealthReport) => void): () => void {
  listeners.push(fn);
  fn({ ...currentReport }); // Immediately call with current state
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx !== -1) listeners.splice(idx, 1);
  };
}

/** Get the current health snapshot */
export function getHealthReport(): HealthReport {
  return { ...currentReport };
}

/** Run a single health check cycle */
export async function runHealthCheck(): Promise<HealthReport> {
  currentReport = { ...currentReport, status: 'checking' };
  notify();

  aiLog('HEALTH', 'Running Groq API health check');

  try {
    const result = await groqProvider.healthCheck();

    currentReport = {
      status: result.ok ? (result.latencyMs < 2000 ? 'healthy' : 'degraded') : 'offline',
      latencyMs: result.latencyMs,
      checkedAt: new Date(),
      error: result.error,
    };

    aiLog('HEALTH', `Check complete — ${currentReport.status} (${result.latencyMs}ms)`);
  } catch (err) {
    currentReport = {
      status: 'offline',
      latencyMs: null,
      checkedAt: new Date(),
      error: err instanceof Error ? err.message : 'Unknown',
    };
    aiLog('HEALTH', `Health check failed — offline`);
  }

  notify();
  return { ...currentReport };
}

/** Run periodic health checks every N minutes */
export function startPeriodicHealthChecks(intervalMinutes = 5): () => void {
  runHealthCheck(); // Run immediately

  const handle = setInterval(() => {
    runHealthCheck();
  }, intervalMinutes * 60 * 1000);

  return () => clearInterval(handle);
}
