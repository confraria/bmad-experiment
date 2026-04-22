import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ErrorFallback } from '../ErrorFallback';

describe('ErrorFallback', () => {
  afterEach(() => cleanup());

  it('renders the non-technical headline and calming body copy', () => {
    render(<ErrorFallback onRetry={() => undefined} />);
    expect(screen.getByText(/something isn.?t rendering/i)).toBeDefined();
    expect(
      screen.getByText(/reload the page and your list will be right where you left it/i),
    ).toBeDefined();
  });

  it('renders exactly one Reload button', () => {
    render(<ErrorFallback onRetry={() => undefined} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0].textContent).toBe('Reload');
  });

  it('clicking Reload invokes onRetry exactly once', async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    render(<ErrorFallback onRetry={onRetry} />);
    await user.click(screen.getByRole('button', { name: /reload/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('does not use role="alert" or destructive/red tokens', () => {
    const { container } = render(<ErrorFallback onRetry={() => undefined} />);
    expect(screen.queryByRole('alert')).toBeNull();
    const allClassNames = Array.from(container.querySelectorAll<HTMLElement>('*'))
      .map((el) => el.className)
      .join(' ');
    expect(allClassNames).not.toMatch(/\b(destructive|red|error-token)\b/);
  });
});
