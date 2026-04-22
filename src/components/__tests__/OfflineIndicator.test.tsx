import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

let mockOnline = true;
vi.mock('@/hooks/useOnlineStatus', () => ({
  useOnlineStatus: () => mockOnline,
}));

import { OfflineIndicator } from '../OfflineIndicator';

describe('OfflineIndicator', () => {
  beforeEach(() => {
    mockOnline = true;
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the status element with opacity-0 when online', () => {
    mockOnline = true;
    render(<OfflineIndicator />);
    const el = screen.getByRole('status', { hidden: true });
    expect(el).toBeTruthy();
    expect(el.className).toMatch(/opacity-0/);
    expect(el.className).not.toMatch(/opacity-100/);
  });

  it('renders the status element with opacity-100 when offline', () => {
    mockOnline = false;
    render(<OfflineIndicator />);
    const el = screen.getByRole('status');
    expect(el.className).toMatch(/opacity-100/);
    expect(el.className).not.toMatch(/opacity-0\b/);
  });

  it('stays mounted in both states so the fade works both directions', () => {
    mockOnline = true;
    const { rerender } = render(<OfflineIndicator />);
    expect(screen.getByRole('status', { hidden: true })).toBeTruthy();

    mockOnline = false;
    rerender(<OfflineIndicator />);
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('uses aria-label="Offline" and role="status"', () => {
    mockOnline = false;
    render(<OfflineIndicator />);
    const el = screen.getByRole('status');
    expect(el.getAttribute('aria-label')).toBe('Offline');
  });

  it('sets aria-hidden="true" when online and "false" when offline', () => {
    mockOnline = true;
    const { rerender } = render(<OfflineIndicator />);
    expect(screen.getByRole('status', { hidden: true }).getAttribute('aria-hidden')).toBe('true');

    mockOnline = false;
    rerender(<OfflineIndicator />);
    expect(screen.getByRole('status').getAttribute('aria-hidden')).toBe('false');
  });

  it('applies the fade transition and fixed top-right positioning', () => {
    mockOnline = false;
    render(<OfflineIndicator />);
    const el = screen.getByRole('status');
    expect(el.className).toMatch(/transition-opacity/);
    expect(el.className).toMatch(/duration-200/);
    expect(el.className).toMatch(/fixed/);
    expect(el.className).toMatch(/top-3/);
    expect(el.className).toMatch(/right-3/);
    expect(el.className).toMatch(/h-1\.5/);
    expect(el.className).toMatch(/w-1\.5/);
    expect(el.className).toMatch(/rounded-full/);
    expect(el.className).toMatch(/pointer-events-none/);
  });
});
