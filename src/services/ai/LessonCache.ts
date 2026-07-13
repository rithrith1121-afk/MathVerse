/**
 * LessonCache — localStorage-backed cache for lesson sections.
 *
 * Keys:  mv_lesson_{topic}_{level}_{section}
 * TTL:   24 hours per section (lessons don't change that fast)
 *
 * Provides instant cache hits so the UI never re-fetches
 * a section the student already viewed this session.
 */

import { aiLog } from './AILogger';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CacheEntry<T> {
  data: T;
  cachedAt: number; // Unix timestamp ms
}

function makeKey(topic: string, level: string, section: string): string {
  // Normalize to avoid key collisions from whitespace
  const t = topic.trim().toLowerCase().replace(/\s+/g, '_');
  const l = level.trim().toLowerCase().replace(/\s+/g, '_');
  return `mv_lesson_${t}_${l}_${section}`;
}

/** Write a lesson section to localStorage cache */
export function cacheSection<T>(topic: string, level: string, section: string, data: T): void {
  try {
    const key = makeKey(topic, level, section);
    const entry: CacheEntry<T> = { data, cachedAt: Date.now() };
    localStorage.setItem(key, JSON.stringify(entry));
    aiLog('CACHE', `Cached section: ${section} for "${topic}"`);
  } catch {
    // Storage quota exceeded — silently ignore
    aiLog('WARN', `Cache write failed for section: ${section}`);
  }
}

/** Read a lesson section from localStorage cache (returns null on miss/expired) */
export function readCachedSection<T>(
  topic: string,
  level: string,
  section: string
): T | null {
  try {
    const key = makeKey(topic, level, section);
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    const entry: CacheEntry<T> = JSON.parse(raw);
    const age = Date.now() - entry.cachedAt;

    if (age > CACHE_TTL_MS) {
      localStorage.removeItem(key);
      aiLog('CACHE', `Cache expired for section: ${section}`);
      return null;
    }

    aiLog('CACHE', `Cache HIT for section: ${section} (age: ${Math.round(age / 60000)}m)`);
    return entry.data;
  } catch {
    return null;
  }
}

/** Invalidate all cached sections for a topic */
export function invalidateTopic(topic: string, level: string): void {
  const prefix = makeKey(topic, level, '');
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(prefix)) keysToRemove.push(key);
  }
  keysToRemove.forEach(k => localStorage.removeItem(k));
  aiLog('CACHE', `Invalidated all cache for "${topic}"`);
}

/** Check if a section is cached and fresh */
export function isCached(topic: string, level: string, section: string): boolean {
  return readCachedSection(topic, level, section) !== null;
}
