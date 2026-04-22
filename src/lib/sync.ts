import { z } from 'zod';
import { getDb } from './db';
import { getClientId } from './clientId';
import { TodoSchema, type Todo } from './schema';

let DEBOUNCE_MS = 300;
const MAX_ATTEMPTS = 5;
const BACKOFF_CAP_MS = 30_000;
let BACKOFF_BASE_MS = 2_000;
const BATCH_LIMIT = 500;
const MAX_BATCHES_PER_TICK = 10;

const LAST_SYNC_AT = 'bmad:lastSyncAt';
const LAST_PUSH_AT = 'bmad:lastPushAt';

const PullResponseSchema = z.object({ todos: z.array(TodoSchema) });

let listenerAttached = false;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let inflight: Promise<void> | null = null;

function readCursor(key: string): number {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return 0;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

function writeCursor(key: string, value: number): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // storage unavailable — cursor will reset next load; acceptable for v1
  }
}

export function shouldWrite(existing: Todo | undefined, incoming: Todo): boolean {
  if (!existing) return true;
  if (existing.deletedAt !== null && incoming.deletedAt === null) return false;
  if (incoming.deletedAt !== null) return true;
  return incoming.updatedAt > existing.updatedAt;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffMs(attempt: number): number {
  return Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** attempt);
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function reportClientError(payload: Record<string, unknown>): void {
  try {
    fetch('/api/errors', {
      method: 'POST',
      keepalive: true,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => undefined);
  } catch {
    // Fire-and-forget: never block the engine on telemetry.
  }
}

async function fetchWithRetry(input: string, init?: RequestInit): Promise<Response> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(input, init);
      if (res.ok) return res;
      if (res.status >= 500 || res.status === 429) {
        if (attempt === MAX_ATTEMPTS - 1) throw new HttpError(res.status, 'retryable error');
        await delay(backoffMs(attempt));
        continue;
      }
      throw new HttpError(res.status, `HTTP ${res.status}`);
    } catch (err) {
      if (err instanceof HttpError && err.status < 500 && err.status !== 429) throw err;
      if (attempt === MAX_ATTEMPTS - 1) throw err;
      await delay(backoffMs(attempt));
    }
  }
  throw new Error('fetchWithRetry: exhausted attempts');
}

async function pull(): Promise<void> {
  const clientId = getClientId();
  const since = readCursor(LAST_SYNC_AT);
  let res: Response;
  try {
    res = await fetchWithRetry(`/api/sync?clientId=${clientId}&since=${since}`);
  } catch {
    return; // transient failure; next tick retries
  }

  const body = await res.json().catch(() => null);
  const parsed = PullResponseSchema.safeParse(body);
  if (!parsed.success) return;

  const incoming = parsed.data.todos;
  if (incoming.length === 0) return;

  const db = getDb();
  let maxUpdatedAt = since;
  await db.transaction('rw', db.todos, async () => {
    for (const serverTodo of incoming) {
      const existing = await db.todos.get(serverTodo.id);
      if (shouldWrite(existing, serverTodo)) {
        await db.todos.put(serverTodo);
      }
      if (serverTodo.updatedAt > maxUpdatedAt) maxUpdatedAt = serverTodo.updatedAt;
    }
  });

  writeCursor(LAST_SYNC_AT, maxUpdatedAt);
  // Prevent feedback loop: merged rows have updatedAt > old lastPushAt, so without
  // this the next push tick would re-send them to the server.
  const currentPushAt = readCursor(LAST_PUSH_AT);
  if (maxUpdatedAt > currentPushAt) writeCursor(LAST_PUSH_AT, maxUpdatedAt);
}

async function push(): Promise<void> {
  const clientId = getClientId();

  for (let iter = 0; iter < MAX_BATCHES_PER_TICK; iter++) {
    const lastPushAt = readCursor(LAST_PUSH_AT);
    const db = getDb();
    const all = await db.todos.where('updatedAt').above(lastPushAt).sortBy('updatedAt');
    const batch = all.slice(0, BATCH_LIMIT);
    if (batch.length === 0) return;

    let res: Response;
    try {
      res = await fetchWithRetry('/api/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clientId, todos: batch }),
      });
    } catch (err) {
      if (err instanceof HttpError && err.status >= 400 && err.status < 500 && err.status !== 429) {
        // Permanent failure — drop this batch.
        const logPayload = {
          status: err.status,
          ids: batch.map((b) => b.id),
          message: err.message,
        };
        console.error('sync: dropping batch', logPayload);
        reportClientError({
          ...logPayload,
          message: `sync: POST /api/sync ${err.status} — dropping batch`,
          clientId,
          url: typeof window !== 'undefined' ? window.location.href : '',
          caughtAt: 'sync-engine',
        });
        writeCursor(LAST_PUSH_AT, batch[batch.length - 1].updatedAt);
        continue;
      }
      return; // transient — abandon tick, queue preserved
    }

    await res.json().catch(() => null); // drain body; response shape is { accepted: number }
    writeCursor(LAST_PUSH_AT, batch[batch.length - 1].updatedAt);
    if (batch.length < BATCH_LIMIT) return;
  }
}

async function doTick(): Promise<void> {
  await pull();
  await push();
}

function runTick(): void {
  if (inflight) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  inflight = doTick().finally(() => {
    inflight = null;
  });
}

export function scheduleSync(): void {
  if (debounceTimer !== null) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    runTick();
  }, DEBOUNCE_MS);
}

export function startSync(): void {
  if (listenerAttached) return;
  if (typeof window === 'undefined') return;
  window.addEventListener('bmad:mutation', scheduleSync);
  window.addEventListener('online', scheduleSync);
  listenerAttached = true;
  scheduleSync();
}

export function stopSync(): void {
  if (typeof window !== 'undefined') {
    window.removeEventListener('bmad:mutation', scheduleSync);
    window.removeEventListener('online', scheduleSync);
  }
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  listenerAttached = false;
}

export async function syncNow(): Promise<void> {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (inflight) {
    await inflight;
    return;
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  inflight = doTick().finally(() => {
    inflight = null;
  });
  await inflight;
}

export function resetSyncForTests(): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('resetSyncForTests is a test-only hook');
  }
  stopSync();
  inflight = null;
  DEBOUNCE_MS = 300;
  BACKOFF_BASE_MS = 2_000;
  try {
    window.localStorage.removeItem(LAST_SYNC_AT);
    window.localStorage.removeItem(LAST_PUSH_AT);
  } catch {
    // ignore
  }
}

export function configureSyncForTests(opts: { debounceMs?: number; backoffBaseMs?: number }): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('configureSyncForTests is a test-only hook');
  }
  if (opts.debounceMs !== undefined) DEBOUNCE_MS = opts.debounceMs;
  if (opts.backoffBaseMs !== undefined) BACKOFF_BASE_MS = opts.backoffBaseMs;
}
