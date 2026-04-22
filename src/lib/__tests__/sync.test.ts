import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getDb, putTodo, resetDbForTests } from '../db';
import { resetClientIdForTests } from '../clientId';
import {
  startSync,
  stopSync,
  scheduleSync,
  syncNow,
  shouldWrite,
  resetSyncForTests,
  configureSyncForTests,
} from '../sync';
import type { Todo } from '../schema';

const CLIENT_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAW';

function makeServerTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    clientId: CLIENT_ID,
    text: 'from server',
    completed: false,
    createdAt: 1_000,
    updatedAt: 2_000,
    deletedAt: null,
    ...overrides,
  };
}

type FetchFn = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function mockFetchOk(body: unknown): FetchFn {
  return async () =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
}

function mockFetchStatus(status: number, body: unknown = {}): FetchFn {
  return async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
}

beforeEach(async () => {
  window.localStorage.clear();
  resetClientIdForTests();
  await resetDbForTests();
  resetSyncForTests();
  configureSyncForTests({ debounceMs: 1, backoffBaseMs: 1 });
  (window as unknown as Record<string, unknown>).__clientId = CLIENT_ID;
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('shouldWrite (client-side LWW + soft-delete precedence)', () => {
  const base = makeServerTodo({ updatedAt: 100, deletedAt: null });

  it('writes when no existing', () => {
    expect(shouldWrite(undefined, base)).toBe(true);
  });

  it('skips when existing deleted and incoming live', () => {
    const existing: Todo = { ...base, deletedAt: 50 };
    const incoming: Todo = { ...base, deletedAt: null, updatedAt: 200 };
    expect(shouldWrite(existing, incoming)).toBe(false);
  });

  it('writes when incoming is a soft-delete', () => {
    const existing: Todo = { ...base, updatedAt: 200, deletedAt: null };
    const incoming: Todo = { ...base, updatedAt: 100, deletedAt: 100 };
    expect(shouldWrite(existing, incoming)).toBe(true);
  });

  it('writes when LWW by updatedAt', () => {
    const existing: Todo = { ...base, updatedAt: 100 };
    const incoming: Todo = { ...base, updatedAt: 200 };
    expect(shouldWrite(existing, incoming)).toBe(true);
  });

  it('skips on tie (existing wins)', () => {
    const existing: Todo = { ...base, updatedAt: 100 };
    const incoming: Todo = { ...base, updatedAt: 100 };
    expect(shouldWrite(existing, incoming)).toBe(false);
  });
});

describe('sync engine — pull', () => {
  it('merges server rows into Dexie and advances lastSyncAt', async () => {
    const serverRow = makeServerTodo({ updatedAt: 5_000 });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetchOk({ todos: [serverRow] }));

    await syncNow();

    const stored = await getDb().todos.get(serverRow.id);
    expect(stored).toEqual(serverRow);
    expect(window.localStorage.getItem('bmad:lastSyncAt')).toBe('5000');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('applies LWW on merge — server newer overwrites local', async () => {
    await putTodo({ text: 'local' });
    const local = (await getDb().todos.toArray())[0];
    const serverRow: Todo = { ...local, text: 'server wins', updatedAt: local.updatedAt + 1_000 };
    vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetchOk({ todos: [serverRow] }));

    await syncNow();

    const stored = await getDb().todos.get(local.id);
    expect(stored?.text).toBe('server wins');
  });

  it('preserves existing soft-delete against live incoming (soft-delete wins)', async () => {
    const deleted = makeServerTodo({ updatedAt: 1_000, deletedAt: 1_000 });
    await getDb().todos.put(deleted);
    const serverLive: Todo = { ...deleted, deletedAt: null, text: 'revived', updatedAt: 2_000 };
    vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetchOk({ todos: [serverLive] }));

    await syncNow();

    const stored = await getDb().todos.get(deleted.id);
    expect(stored?.deletedAt).toBe(1_000);
    expect(stored?.text).toBe('from server'); // unchanged; skip
  });

  it('does not issue a push after a pure pull (no feedback loop)', async () => {
    const serverRow = makeServerTodo({ updatedAt: 5_000 });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetchOk({ todos: [serverRow] }));

    await syncNow();

    expect(fetchSpy).toHaveBeenCalledTimes(1); // only the GET
    const pushCall = fetchSpy.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === 'POST');
    expect(pushCall).toBeUndefined();
    expect(window.localStorage.getItem('bmad:lastPushAt')).toBe('5000');
  });

  it('empty pull response is a no-op', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetchOk({ todos: [] }));

    await syncNow();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem('bmad:lastSyncAt')).toBeNull();
  });
});

describe('sync engine — push', () => {
  it('pushes local todos with updatedAt > lastPushAt', async () => {
    await putTodo({ text: 'push me' });
    const local = (await getDb().todos.toArray())[0];

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if ((init as RequestInit | undefined)?.method === 'POST') {
        return new Response(JSON.stringify({ accepted: 1 }), { status: 200 });
      }
      return new Response(JSON.stringify({ todos: [] }), { status: 200 });
    });

    await syncNow();

    const postCall = fetchSpy.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === 'POST');
    expect(postCall).toBeDefined();
    const body = JSON.parse((postCall![1] as RequestInit).body as string);
    expect(body.clientId).toBe(CLIENT_ID);
    expect(body.todos).toHaveLength(1);
    expect(body.todos[0].id).toBe(local.id);
    expect(window.localStorage.getItem('bmad:lastPushAt')).toBe(String(local.updatedAt));
  });

  it('respects lastPushAt as a lower bound', async () => {
    // Manually seed Dexie with rows at fixed updatedAt values to avoid Date.now coupling
    const mkId = (i: number) => `01ARZ3NDEKTSV4RRFFQ69G5FA${String.fromCharCode(65 + i)}`;
    const rows: Todo[] = [500, 1_500, 2_000].map((u, i) => ({
      id: mkId(i),
      clientId: CLIENT_ID,
      text: `row ${u}`,
      completed: false,
      createdAt: u,
      updatedAt: u,
      deletedAt: null,
    }));
    for (const r of rows) await getDb().todos.put(r);
    window.localStorage.setItem('bmad:lastPushAt', '1000');

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if ((init as RequestInit | undefined)?.method === 'POST') {
        return new Response(JSON.stringify({ accepted: 2 }), { status: 200 });
      }
      return new Response(JSON.stringify({ todos: [] }), { status: 200 });
    });

    await syncNow();

    const postCall = fetchSpy.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === 'POST');
    const body = JSON.parse((postCall![1] as RequestInit).body as string);
    expect(body.todos.map((t: Todo) => t.updatedAt)).toEqual([1_500, 2_000]);
  });

  it('skips the POST when there is nothing new to push', async () => {
    await putTodo({ text: 'old' });
    const local = (await getDb().todos.toArray())[0];
    window.localStorage.setItem('bmad:lastPushAt', String(local.updatedAt));

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetchOk({ todos: [] }));

    await syncNow();

    const postCall = fetchSpy.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === 'POST');
    expect(postCall).toBeUndefined();
  });
});

describe('sync engine — offline', () => {
  it('skips both pull and push when navigator.onLine is false', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    await putTodo({ text: 'while offline' });

    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await syncNow();

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('sync engine — retry + backoff', () => {
  it('retries on 5xx up to MAX_ATTEMPTS then abandons silently', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetchStatus(500));

    await syncNow();

    expect(fetchSpy).toHaveBeenCalledTimes(5);
    expect(window.localStorage.getItem('bmad:lastSyncAt')).toBeNull();
  });

  it('retries on 429', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetchStatus(429));

    await syncNow();

    expect(fetchSpy).toHaveBeenCalledTimes(5);
  });

  it('drops the batch on 400 and advances lastPushAt', async () => {
    await putTodo({ text: 'super-secret todo text' });
    const local = (await getDb().todos.toArray())[0];
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/api/sync') && (init as RequestInit | undefined)?.method === 'POST') {
        return new Response(
          JSON.stringify({ error: { code: 'INVALID_REQUEST', message: 'bad' } }),
          { status: 400 },
        );
      }
      if (url.includes('/api/errors')) {
        return new Response(null, { status: 204 });
      }
      return new Response(JSON.stringify({ todos: [] }), { status: 200 });
    });

    await syncNow();

    expect(window.localStorage.getItem('bmad:lastPushAt')).toBe(String(local.updatedAt));
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'sync: dropping batch',
      expect.objectContaining({ status: 400, ids: [local.id] }),
    );

    // Story 3.7 wiring: the drop path also fires a fire-and-forget POST to /api/errors
    const errorsCall = fetchSpy.mock.calls.find((c) => String(c[0]).includes('/api/errors'));
    expect(errorsCall).toBeDefined();
    const errorsInit = errorsCall![1] as RequestInit;
    expect(errorsInit.method).toBe('POST');
    expect(errorsInit.keepalive).toBe(true);
    const errorsBody = JSON.parse(errorsInit.body as string);
    expect(errorsBody.ids).toEqual([local.id]);
    expect(errorsBody.caughtAt).toBe('sync-engine');
    // Architecture guardrail #3 — no user todo text in error reports
    expect(JSON.stringify(errorsBody)).not.toContain('super-secret todo text');
  });
});

describe('sync engine — scheduleSync + debounce', () => {
  it('debounces multiple scheduleSync calls into one tick', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetchOk({ todos: [] }));

    scheduleSync();
    scheduleSync();
    scheduleSync();

    await new Promise((r) => setTimeout(r, 20));

    const getCalls = fetchSpy.mock.calls.filter(
      (c) => !(c[1] as RequestInit | undefined)?.method || (c[1] as RequestInit).method === 'GET',
    );
    expect(getCalls.length).toBe(1);
  });
});

describe('startSync / stopSync', () => {
  it('startSync schedules an initial tick and is idempotent; stopSync detaches listeners', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetchOk({ todos: [] }));

    startSync();
    startSync(); // idempotent

    await new Promise((r) => setTimeout(r, 20));

    const getCalls = fetchSpy.mock.calls.filter(
      (c) => !(c[1] as RequestInit | undefined)?.method || (c[1] as RequestInit).method === 'GET',
    );
    expect(getCalls.length).toBe(1);

    stopSync();
    window.dispatchEvent(new CustomEvent('bmad:mutation'));
    await new Promise((r) => setTimeout(r, 20));

    const afterStop = fetchSpy.mock.calls.filter(
      (c) => !(c[1] as RequestInit | undefined)?.method || (c[1] as RequestInit).method === 'GET',
    );
    expect(afterStop.length).toBe(1);
  });
});
