import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getClientId, resetClientIdForTests } from '../clientId';

const STORAGE_KEY = 'bmad-experiment:clientId';

describe('getClientId', () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetClientIdForTests();
  });

  afterEach(() => {
    resetClientIdForTests();
    vi.restoreAllMocks();
  });

  it('first call generates and persists a ULID to localStorage under the correct key (P1)', () => {
    const id = getClientId();
    expect(id).toHaveLength(26);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(id);
  });

  it('second call returns the same value without writing again (P1)', () => {
    const first = getClientId();
    const setItemSpy = vi.spyOn(window.localStorage, 'setItem');
    const second = getClientId();
    expect(second).toBe(first);
    expect(setItemSpy).not.toHaveBeenCalled();
  });

  it('reset helper clears cache + localStorage; next call generates a new ULID (P1)', () => {
    const first = getClientId();
    resetClientIdForTests();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    const second = getClientId();
    expect(second).not.toBe(first);
    expect(second).toHaveLength(26);
  });

  it('reuses an existing localStorage value on fresh module state', () => {
    const preseeded = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
    window.localStorage.setItem(STORAGE_KEY, preseeded);
    const id = getClientId();
    expect(id).toBe(preseeded);
  });

  it('window.__clientId override (in test mode) returns the injected value', () => {
    const injected = '01ARZ3NDEKTSV4RRFFQ69G5FAW';
    (window as unknown as Record<string, unknown>).__clientId = injected;
    expect(getClientId()).toBe(injected);
  });

  it('quota-error fallback: getClientId still returns a valid ULID without throwing', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const id = getClientId();
    expect(id).toHaveLength(26);
    expect(errorSpy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('throws a descriptive error when window is undefined (SSR guard)', async () => {
    const originalWindow = globalThis.window;
    delete (globalThis as { window?: unknown }).window;
    try {
      const mod = await import('../clientId');
      // Force a fresh module state so the SSR throw path runs
      vi.resetModules();
      const fresh = await import('../clientId');
      expect(() => fresh.getClientId()).toThrow(/Client Component/);
      void mod;
    } finally {
      (globalThis as { window?: unknown }).window = originalWindow;
      vi.resetModules();
    }
  });

  it('does not log the clientId on the quota fallback path', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const id = getClientId();
    const anyErrorArgContainsId = errorSpy.mock.calls.some((args) =>
      args.some((arg) => typeof arg === 'string' && arg.includes(id)),
    );
    expect(anyErrorArgContainsId).toBe(false);
    spy.mockRestore();
  });
});
