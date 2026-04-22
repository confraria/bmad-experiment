import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { SyncPullQuerySchema, type Todo } from '@/lib/schema';

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
      return Response.json(
        {
          error: {
            code: 'INVALID_REQUEST',
            message: err.issues[0]?.message ?? 'Invalid request',
          },
        },
        { status: 400 },
      );
    }
    console.error('GET /api/sync failed:', err);
    return Response.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
      { status: 500 },
    );
  }
}
