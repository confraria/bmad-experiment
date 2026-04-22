import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

import { EmptyState } from '../EmptyState';

describe('EmptyState', () => {
  afterEach(() => cleanup());

  it('renders nothing', () => {
    const { container } = render(<EmptyState />);
    expect(container.firstChild).toBeNull();
  });

  it('is pure — re-renders produce identical output', () => {
    const first = render(<EmptyState />);
    expect(first.container.firstChild).toBeNull();
    first.unmount();

    const second = render(<EmptyState />);
    expect(second.container.firstChild).toBeNull();
  });
});
