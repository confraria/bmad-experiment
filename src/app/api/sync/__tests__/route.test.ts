import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockFindMany = vi.fn();
vi.mock('@/lib/prisma', () => ({
  prisma: { todo: { findMany: (...args: unknown[]) => mockFindMany(...args) } },
}));

const { GET } = await import('../route');

const VALID_CLIENT_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAW';

function makeReq(qs: string): NextRequest {
  return new NextRequest(`http://localhost/api/sync${qs ? '?' + qs : ''}`);
}

function row(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    clientId: VALID_CLIENT_ID,
    text: 'buy milk',
    completed: false,
    createdAt: BigInt(1_700_000_000_000),
    updatedAt: BigInt(1_700_000_000_500),
    deletedAt: null as bigint | null,
    ...overrides,
  };
}

beforeEach(() => {
  mockFindMany.mockReset();
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
