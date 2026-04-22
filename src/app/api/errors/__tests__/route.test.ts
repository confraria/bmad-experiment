import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

import { POST } from '../route';

const CLIENT_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAW';

function postReq(body: unknown, { raw = false }: { raw?: boolean } = {}): NextRequest {
  return new NextRequest('http://localhost/api/errors', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: raw ? (body as string) : JSON.stringify(body),
  });
}

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('POST /api/errors', () => {
  it('returns 204 with empty body for a valid minimum payload and logs the payload', async () => {
    const res = await POST(postReq({ message: 'boom', clientId: CLIENT_ID }));

    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[client error]',
      expect.objectContaining({ message: 'boom', clientId: CLIENT_ID }),
    );
  });

  it('accepts a full payload with optional fields', async () => {
    const payload = {
      message: 'render error',
      clientId: CLIENT_ID,
      stack: 'at X (y.js:1:1)',
      userAgent: 'Mozilla/5.0',
      url: 'https://example.com/',
      caughtAt: 'app',
    };

    const res = await POST(postReq(payload));

    expect(res.status).toBe(204);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[client error]',
      expect.objectContaining(payload),
    );
  });

  it('passes through unknown extra fields in the log', async () => {
    const res = await POST(
      postReq({
        message: 'boom',
        clientId: CLIENT_ID,
        severity: 'fatal',
        release: 'v1.2.3',
      }),
    );

    expect(res.status).toBe(204);
    const logged = consoleErrorSpy.mock.calls[0][1] as Record<string, unknown>;
    expect(logged.severity).toBe('fatal');
    expect(logged.release).toBe('v1.2.3');
  });

  it('returns 204 and logs "invalid payload" when message is missing', async () => {
    const res = await POST(postReq({ clientId: CLIENT_ID }));

    expect(res.status).toBe(204);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[client error] invalid payload',
      expect.objectContaining({ issues: expect.any(Array) }),
    );
  });

  it('returns 204 for a non-ULID clientId (invalid payload branch)', async () => {
    const res = await POST(postReq({ message: 'boom', clientId: 'not-a-ulid' }));

    expect(res.status).toBe(204);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[client error] invalid payload',
      expect.any(Object),
    );
  });

  it('returns 204 for a non-JSON body and logs the "not JSON" message', async () => {
    const res = await POST(postReq('oops-not-json', { raw: true }));

    expect(res.status).toBe(204);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[client error] invalid payload: body is not JSON',
    );
  });

  it('returns 204 for an empty body', async () => {
    const req = new NextRequest('http://localhost/api/errors', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '',
    });

    const res = await POST(req);

    expect(res.status).toBe(204);
  });

  it('response body is always empty regardless of path', async () => {
    const r1 = await POST(postReq({ message: 'ok', clientId: CLIENT_ID }));
    const r2 = await POST(postReq({ clientId: CLIENT_ID })); // missing message
    const r3 = await POST(postReq('junk', { raw: true }));

    expect(await r1.text()).toBe('');
    expect(await r2.text()).toBe('');
    expect(await r3.text()).toBe('');
  });
});
