import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import RouteError from '../error';

describe('app/error.tsx', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it('renders the minimal fallback UI', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<RouteError error={new Error('secret details')} reset={() => undefined} />);
    expect(screen.getByText(/something isn.?t rendering/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /reload/i })).toBeDefined();
  });

  it('does not render the error message, stack, or digest', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const error = Object.assign(new Error('secret-do-not-show'), { digest: 'DIGEST_ABC' });
    error.stack = 'at stack-trace-line-that-must-not-surface';
    const { container } = render(<RouteError error={error} reset={() => undefined} />);
    const text = container.textContent ?? '';
    expect(text).not.toContain('secret-do-not-show');
    expect(text).not.toContain('DIGEST_ABC');
    expect(text).not.toContain('stack-trace-line');
  });

  it('clicking Reload calls reset() once', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const reset = vi.fn();
    const user = userEvent.setup();
    render(<RouteError error={new Error('x')} reset={reset} />);
    await user.click(screen.getByRole('button', { name: /reload/i }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('logs the error to console.error on mount (for devtools / server logs)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const error = new Error('for-devtools-only');
    render(<RouteError error={error} reset={() => undefined} />);
    const loggedWithOurError = spy.mock.calls.some((args) =>
      args.some((arg) => arg === error || (typeof arg === 'string' && arg.includes('RouteError'))),
    );
    expect(loggedWithOurError).toBe(true);
  });
});
