import { NextRequest } from 'next/server';
import { ErrorReportSchema } from '@/lib/schema';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      console.error('[client error] invalid payload: body is not JSON');
      return new Response(null, { status: 204 });
    }
    const parsed = ErrorReportSchema.safeParse(rawBody);
    if (!parsed.success) {
      console.error('[client error] invalid payload', {
        issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
      });
      return new Response(null, { status: 204 });
    }
    console.error('[client error]', parsed.data);
    return new Response(null, { status: 204 });
  } catch (err) {
    console.error('[client error] handler fault', err);
    return new Response(null, { status: 204 });
  }
}
