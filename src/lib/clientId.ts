import { newUlid } from './ulid';

const STORAGE_KEY = 'bmad-experiment:clientId';
const WINDOW_OVERRIDE_KEY = '__clientId';

let cached: string | undefined;

function getWindowOverride(): string | undefined {
  if (process.env.NODE_ENV !== 'test') return undefined;
  const w = window as unknown as Record<string, unknown>;
  const v = w[WINDOW_OVERRIDE_KEY];
  return typeof v === 'string' ? v : undefined;
}

export function getClientId(): string {
  if (typeof window === 'undefined') {
    throw new Error(
      'getClientId() must be called from a Client Component (window is undefined). ' +
        'Wrap the caller in a "use client" boundary or invoke it inside useEffect.',
    );
  }

  const override = getWindowOverride();
  if (override !== undefined) {
    return override;
  }

  if (cached !== undefined) return cached;

  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing !== null && existing.length === 26) {
      cached = existing;
      return existing;
    }
    const generated = newUlid();
    window.localStorage.setItem(STORAGE_KEY, generated);
    cached = generated;
    return generated;
  } catch {
    console.warn('clientId: localStorage unavailable, using session ULID');
    const fallback = newUlid();
    cached = fallback;
    return fallback;
  }
}

export function resetClientIdForTests(): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('resetClientIdForTests is a test-only hook');
  }
  cached = undefined;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore — test environments may mock storage
  }
  const w = window as unknown as Record<string, unknown>;
  delete w[WINDOW_OVERRIDE_KEY];
}
