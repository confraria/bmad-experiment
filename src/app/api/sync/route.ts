import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import {
  SyncPullQuerySchema,
  SyncPushBodySchema,
  type Todo,
} from '@/lib/schema';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const params = SyncPullQuerySchema.parse({
      clientId: req.nextUrl.searchParams.get('clientId'),
      since: req.nextUrl.searchParams.get('since'),
    });

    const rows = await prisma.todo.findMany({
      where: {
        clientId: params.clientId,
        updatedAt: { gt: BigInt(params.since) },
      },
      orderBy: { updatedAt: 'asc' },
    });

    const todos: Todo[] = rows.map((r) => ({
      id: r.id,
      clientId: r.clientId,
      text: r.text,
      completed: r.completed,
      createdAt: Number(r.createdAt),
      updatedAt: Number(r.updatedAt),
      deletedAt: r.deletedAt === null ? null : Number(r.deletedAt),
    }));

    return Response.json({ todos });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return invalidRequest(err.issues[0]?.message ?? 'Invalid request');
    }
    console.error('GET /api/sync failed:', err);
    return internalError();
  }
}

export async function POST(req: NextRequest) {
  try {
    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return invalidRequest('body is not valid JSON');
    }
    const body = SyncPushBodySchema.parse(rawBody);

    if (body.todos.length === 0) {
      return Response.json({ accepted: 0 });
    }

    const accepted = await reconcile(body.todos);
    return Response.json({ accepted });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return invalidRequest(err.issues[0]?.message ?? 'Invalid request');
    }
    console.error('POST /api/sync failed:', err);
    return internalError();
  }
}

async function reconcile(todos: Todo[]): Promise<number> {
  const ids = todos.map((t) => t.id);
  return prisma.$transaction(async (tx) => {
    const existingRows = await tx.todo.findMany({ where: { id: { in: ids } } });
    const existingById = new Map(existingRows.map((r) => [r.id, r]));
    let accepted = 0;

    for (const incoming of todos) {
      const existing = existingById.get(incoming.id);
      if (shouldWrite(existing, incoming)) {
        const row = toDbRow(incoming);
        await tx.todo.upsert({
          where: { id: incoming.id },
          create: row,
          update: row,
        });
        accepted++;
      }
    }
    return accepted;
  });
}

function shouldWrite(
  existing: { updatedAt: bigint; deletedAt: bigint | null } | undefined,
  incoming: Todo,
): boolean {
  if (!existing) return true;
  if (existing.deletedAt !== null && incoming.deletedAt === null) return false;
  if (incoming.deletedAt !== null) return true;
  return incoming.updatedAt > Number(existing.updatedAt);
}

function toDbRow(t: Todo) {
  return {
    id: t.id,
    clientId: t.clientId,
    text: t.text,
    completed: t.completed,
    createdAt: BigInt(t.createdAt),
    updatedAt: BigInt(t.updatedAt),
    deletedAt: t.deletedAt === null ? null : BigInt(t.deletedAt),
  };
}

function invalidRequest(message: string) {
  return Response.json(
    { error: { code: 'INVALID_REQUEST', message } },
    { status: 400 },
  );
}

function internalError() {
  return Response.json(
    { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
    { status: 500 },
  );
}
