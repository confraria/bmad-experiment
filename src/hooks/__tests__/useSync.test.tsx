import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';

const startSyncMock = vi.fn();
const stopSyncMock = vi.fn();

vi.mock('@/lib/sync', () => ({
  startSync: () => startSyncMock(),
  stopSync: () => stopSyncMock(),
}));

import { useSync } from '../useSync';

describe('useSync', () => {
  beforeEach(() => {
    startSyncMock.mockReset();
    stopSyncMock.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('calls startSync on mount and stopSync on unmount', () => {
    const { unmount } = renderHook(() => useSync());

    expect(startSyncMock).toHaveBeenCalledTimes(1);
    expect(stopSyncMock).not.toHaveBeenCalled();

    unmount();

    expect(stopSyncMock).toHaveBeenCalledTimes(1);
  });

  it('does not re-call startSync on re-render', () => {
    const { rerender } = renderHook(() => useSync());

    expect(startSyncMock).toHaveBeenCalledTimes(1);

    rerender();
    rerender();

    expect(startSyncMock).toHaveBeenCalledTimes(1);
  });
});
