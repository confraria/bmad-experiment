import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockFindMany = vi.fn();
const mockTxFindMany = vi.fn();
const mockTxUpsert = vi.fn();
const mockTransaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
  fn({ todo: { findMany: mockTxFindMany, upsert: mockTxUpsert } }),
);
vi.mock('@/lib/prisma', () => ({
  prisma: {
    todo: { findMany: (...args: unknown[]) => mockFindMany(...args) },
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => mockTransaction(fn),
  },
}));

const { GET, POST } = await import('../route');

const VALID_CLIENT_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAW';
const OTHER_CLIENT_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAX';
const TODO_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';

function makeReq(qs: string): NextRequest {
  return new NextRequest(`http://localhost/api/sync${qs ? '?' + qs : ''}`);
}

function postReq(body: unknown, { raw = false }: { raw?: boolean } = {}): NextRequest {
  return new NextRequest('http://localhost/api/sync', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: raw ? (body as string) : JSON.stringify(body),
  });
}

function row(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: TODO_ID,
    clientId: VALID_CLIENT_ID,
    text: 'buy milk',
    completed: false,
    createdAt: BigInt(1_700_000_000_000),
    updatedAt: BigInt(1_700_000_000_500),
    deletedAt: null as bigint | null,
    ...overrides,
  };
}

function todo(overrides: Partial<Record<string, unknown>> = {}) {
  const createdAt = (overrides.createdAt as number | undefined) ?? 1_000;
  const updatedAt = (overrides.updatedAt as number | undefined) ?? createdAt;
  return {
    id: TODO_ID,
    clientId: VALID_CLIENT_ID,
    text: 'buy milk',
    completed: false,
    createdAt,
    updatedAt,
    deletedAt: null as number | null,
    ...overrides,
  };
}

beforeEach(() => {
  mockFindMany.mockReset();
  mockTxFindMany.mockReset();
  mockTxUpsert.mockReset();
  mockTransaction.mockReset();
  mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({ todo: { findMany: mockTxFindMany, upsert: mockTxUpsert } }),
  );
});

describe('GET /api/sync', () => {
  it('returns 200 with mapped todos for a valid request (AC #1)', async () => {
    mockFindMany.mockResolvedValueOnce([row()]);

    const res = await GET(makeReq(`clientId=${VALID_CLIENT_ID}&since=1700000000000`));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      todos: [
        {
          id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
          clientId: VALID_CLIENT_ID,
          text: 'buy milk',
          completed: false,
          createdAt: 1_700_000_000_000,
          updatedAt: 1_700_000_000_500,
          deletedAt: null,
        },
      ],
    });
    expect(typeof body.todos[0].createdAt).toBe('number');
    expect(typeof body.todos[0].updatedAt).toBe('number');
  });

  it('passes BigInt(since) and matching clientId to Prisma (AC #2)', async () => {
    mockFindMany.mockResolvedValueOnce([]);

    await GET(makeReq(`clientId=${VALID_CLIENT_ID}&since=0`));

    expect(mockFindMany).toHaveBeenCalledTimes(1);
    const call = mockFindMany.mock.calls[0][0];
    expect(call.where.clientId).toBe(VALID_CLIENT_ID);
    expect(call.where.updatedAt.gt).toBe(BigInt(0));
    expect(call.orderBy).toEqual({ updatedAt: 'asc' });
  });

  it('returns { todos: [] } for an unknown clientId (AC #3)', async () => {
    mockFindMany.mockResolvedValueOnce([]);

    const res = await GET(makeReq(`clientId=${VALID_CLIENT_ID}&since=0`));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ todos: [] });
  });

  it('includes soft-deleted rows and converts deletedAt bigint → number (AC #1, #4)', async () => {
    mockFindMany.mockResolvedValueOnce([row({ deletedAt: BigInt(1_700_000_000_900) })]);

    const res = await GET(makeReq(`clientId=${VALID_CLIENT_ID}&since=0`));

    const body = await res.json();
    expect(body.todos).toHaveLength(1);
    expect(body.todos[0].deletedAt).toBe(1_700_000_000_900);
    expect(typeof body.todos[0].deletedAt).toBe('number');
  });

  it('returns 400 INVALID_REQUEST for a non-ULID clientId (AC #5)', async () => {
    const res = await GET(makeReq('clientId=not-a-ulid&since=0'));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_REQUEST');
    expect(typeof body.error.message).toBe('string');
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it('returns 400 for a missing since (AC #5)', async () => {
    const res = await GET(makeReq(`clientId=${VALID_CLIENT_ID}`));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_REQUEST');
  });

  it('returns 400 for a negative since (AC #5)', async () => {
    const res = await GET(makeReq(`clientId=${VALID_CLIENT_ID}&since=-5`));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a float since (AC #5)', async () => {
    const res = await GET(makeReq(`clientId=${VALID_CLIENT_ID}&since=1.5`));
    expect(res.status).toBe(400);
  });

  it('returns 500 INTERNAL_ERROR when Prisma throws, without leaking the cause (AC #6)', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFindMany.mockRejectedValueOnce(new Error('db unreachable'));

    const res = await GET(makeReq(`clientId=${VALID_CLIENT_ID}&since=0`));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
    expect(JSON.stringify(body)).not.toContain('db unreachable');
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});

describe('POST /api/sync', () => {
  it('returns { accepted: 0 } for an empty batch without touching the DB (AC #5)', async () => {
    const res = await POST(postReq({ clientId: VALID_CLIENT_ID, todos: [] }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ accepted: 0 });
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockTxFindMany).not.toHaveBeenCalled();
    expect(mockTxUpsert).not.toHaveBeenCalled();
  });

  it('inserts a new todo (no existing row) and returns accepted: 1 (AC #1)', async () => {
    mockTxFindMany.mockResolvedValueOnce([]);
    mockTxUpsert.mockResolvedValueOnce({});

    const incoming = todo();
    const res = await POST(postReq({ clientId: VALID_CLIENT_ID, todos: [incoming] }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ accepted: 1 });
    expect(mockTxUpsert).toHaveBeenCalledTimes(1);
    const call = mockTxUpsert.mock.calls[0][0];
    expect(call.where).toEqual({ id: TODO_ID });
    expect(call.create.createdAt).toBe(BigInt(incoming.createdAt));
    expect(call.create.updatedAt).toBe(BigInt(incoming.updatedAt));
    expect(call.create.deletedAt).toBe(null);
  });

  it('overwrites when incoming.updatedAt > existing.updatedAt (LWW, AC #2)', async () => {
    mockTxFindMany.mockResolvedValueOnce([row({ updatedAt: BigInt(1_000), deletedAt: null })]);
    mockTxUpsert.mockResolvedValueOnce({});

    const incoming = todo({ updatedAt: 2_000 });
    const res = await POST(postReq({ clientId: VALID_CLIENT_ID, todos: [incoming] }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ accepted: 1 });
    expect(mockTxUpsert).toHaveBeenCalledTimes(1);
  });

  it('no-ops when incoming.updatedAt < existing.updatedAt (AC #2)', async () => {
    mockTxFindMany.mockResolvedValueOnce([row({ updatedAt: BigInt(2_000), deletedAt: null })]);

    const incoming = todo({ updatedAt: 1_000 });
    const res = await POST(postReq({ clientId: VALID_CLIENT_ID, todos: [incoming] }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ accepted: 0 });
    expect(mockTxUpsert).not.toHaveBeenCalled();
  });

  it('ties on updatedAt resolve to existing (idempotent replay, AC #2)', async () => {
    mockTxFindMany.mockResolvedValueOnce([row({ updatedAt: BigInt(1_500), deletedAt: null })]);

    const incoming = todo({ updatedAt: 1_500 });
    const res = await POST(postReq({ clientId: VALID_CLIENT_ID, todos: [incoming] }));

    expect(await res.json()).toEqual({ accepted: 0 });
    expect(mockTxUpsert).not.toHaveBeenCalled();
  });

  it('incoming soft-delete wins even when older than existing live row (AC #3)', async () => {
    mockTxFindMany.mockResolvedValueOnce([row({ updatedAt: BigInt(2_000), deletedAt: null })]);
    mockTxUpsert.mockResolvedValueOnce({});

    const incoming = todo({ updatedAt: 1_000, deletedAt: 1_000 });
    const res = await POST(postReq({ clientId: VALID_CLIENT_ID, todos: [incoming] }));

    expect(await res.json()).toEqual({ accepted: 1 });
    expect(mockTxUpsert).toHaveBeenCalledTimes(1);
    const call = mockTxUpsert.mock.calls[0][0];
    expect(call.update.deletedAt).toBe(BigInt(1_000));
  });

  it('existing soft-delete persists against incoming live row (AC #3)', async () => {
    mockTxFindMany.mockResolvedValueOnce([
      row({ updatedAt: BigInt(1_000), deletedAt: BigInt(1_000) }),
    ]);

    const incoming = todo({ updatedAt: 2_000, deletedAt: null });
    const res = await POST(postReq({ clientId: VALID_CLIENT_ID, todos: [incoming] }));

    expect(await res.json()).toEqual({ accepted: 0 });
    expect(mockTxUpsert).not.toHaveBeenCalled();
  });

  it('rejects a mixed-clientId batch with 400 and never touches the DB (AC #4)', async () => {
    const res = await POST(
      postReq({
        clientId: VALID_CLIENT_ID,
        todos: [
          todo({ id: '01ARZ3NDEKTSV4RRFFQ69G5FAV' }),
          todo({ id: '01ARZ3NDEKTSV4RRFFQ69G5FA0', clientId: OTHER_CLIENT_ID }),
        ],
      }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_REQUEST');
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('rejects a batch of 501 todos with 400 (AC #5)', async () => {
    const ULID_CHARS = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    const gen = (i: number) => {
      const base = TODO_ID.split('');
      for (let k = 0; k < 5; k++) base[25 - k] = ULID_CHARS[(i >> (k * 5)) & 0x1f];
      return base.join('');
    };
    const todos = Array.from({ length: 501 }, (_, i) => todo({ id: gen(i) }));
    const res = await POST(postReq({ clientId: VALID_CLIENT_ID, todos }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_REQUEST');
  });

  it('rejects a non-JSON body with 400 (AC #6)', async () => {
    const res = await POST(postReq('oops-not-json', { raw: true }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toEqual({
      code: 'INVALID_REQUEST',
      message: 'body is not valid JSON',
    });
  });

  it('rejects a body missing the todos field with 400 (AC #6)', async () => {
    const res = await POST(postReq({ clientId: VALID_CLIENT_ID }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_REQUEST');
  });

  it('returns 500 without leaking the cause when the transaction throws (AC #7)', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockTransaction.mockRejectedValueOnce(new Error('tx aborted'));

    const res = await POST(postReq({ clientId: VALID_CLIENT_ID, todos: [todo()] }));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
    expect(JSON.stringify(body)).not.toContain('tx aborted');
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});
