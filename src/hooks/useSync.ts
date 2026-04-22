'use client';

import { useEffect } from 'react';
import { startSync, stopSync } from '@/lib/sync';

export function useSync(): void {
  useEffect(() => {
    startSync();
    return () => stopSync();
  }, []);
}
