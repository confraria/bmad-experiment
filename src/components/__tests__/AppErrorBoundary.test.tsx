import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AppErrorBoundary } from '../AppErrorBoundary';
import { resetClientIdForTests } from '@/lib/clientId';

function Thrower({ message = 'boom' }: { message?: string }): never {
  throw new Error(message);
}

function NeverThrows() {
  return <p data-testid="ok">ok</p>;
}

const throwFlag = { shouldThrow: true };
type ToggleableProps = { flag: { shouldThrow: boolean } };
function Toggleable({ flag }: ToggleableProps) {
  if (flag.shouldThrow) throw new Error('conditional boom');
  return <p data-testid="toggle-ok">toggle-ok</p>;
}

describe('AppErrorBoundary', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    window.localStorage.clear();
    resetClientIdForTests();
    fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    // Suppress React's dev-mode console.error for expected boundary catches.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    cleanup();
  });

  it('renders children when they do not throw', () => {
    render(
      <AppErrorBoundary>
        <NeverThrows />
      </AppErrorBoundary>,
    );
    expect(screen.getByTestId('ok')).toBeDefined();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders the ErrorFallback when a child throws during render', () => {
    render(
      <AppErrorBoundary>
        <Thrower />
      </AppErrorBoundary>,
    );
    expect(screen.getByText(/something isn.?t rendering/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /reload/i })).toBeDefined();
  });

  it('Reload flips hasError so children can re-mount cleanly', async () => {
    throwFlag.shouldThrow = true;
    const { rerender } = render(
      <AppErrorBoundary>
        <Toggleable flag={throwFlag} />
      </AppErrorBoundary>,
    );
    expect(screen.getByRole('button', { name: /reload/i })).toBeDefined();

    // Before clicking Reload, stop the next render from throwing.
    throwFlag.shouldThrow = false;

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /reload/i }));
    // Re-render the same tree so AppErrorBoundary re-mounts children.
    rerender(
      <AppErrorBoundary>
        <Toggleable flag={throwFlag} />
      </AppErrorBoundary>,
    );

    expect(screen.getByTestId('toggle-ok')).toBeDefined();
    expect(screen.queryByRole('button', { name: /reload/i })).toBeNull();
  });

  it('POSTs /api/errors with the documented payload shape', async () => {
    render(
      <AppErrorBoundary>
        <Thrower message="reportable boom" />
      </AppErrorBoundary>,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/errors');
    expect(init.method).toBe('POST');
    expect(init.keepalive).toBe(true);
    expect(init.headers['Content-Type']).toBe('application/json');

    const payload = JSON.parse(init.body as string);
    expect(Object.keys(payload).sort()).toEqual(
      ['caughtAt', 'clientId', 'message', 'stack', 'url', 'userAgent'].sort(),
    );
    expect(payload.message).toBe('reportable boom');
    expect(typeof payload.stack).toBe('string');
    expect(payload.clientId).toMatch(/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
    expect(payload.userAgent).toBe(window.navigator.userAgent);
    expect(payload.url).toBe(window.location.href);
    expect(payload.caughtAt).toBe('app');
  });

  it('fetch rejection does not propagate; fallback still renders', () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    render(
      <AppErrorBoundary>
        <Thrower />
      </AppErrorBoundary>,
    );
    expect(screen.getByText(/something isn.?t rendering/i)).toBeDefined();
    // No unhandled rejection guaranteed at assertion time because the
    // componentDidCatch swallows the rejection via `.catch(() => undefined)`.
  });

  it('payload omits todo text, input values, and component props', () => {
    render(
      <AppErrorBoundary>
        <Thrower message="contains-sensitive-value" />
      </AppErrorBoundary>,
    );
    const body = fetchMock.mock.calls[0][1].body as string;
    // The message field is allowed to contain error text authored by the
    // developer; payload fields outside the whitelist are what we forbid.
    const parsed = JSON.parse(body) as Record<string, unknown>;
    expect(parsed).not.toHaveProperty('componentStack');
    expect(parsed).not.toHaveProperty('errorInfo');
    expect(parsed).not.toHaveProperty('props');
    expect(parsed).not.toHaveProperty('todos');
  });
});
