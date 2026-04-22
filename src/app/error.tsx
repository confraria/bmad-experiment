'use client';

import { useEffect, useRef } from 'react';
import { ErrorFallback } from '@/components/ErrorFallback';

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const retriedOnceRef = useRef(false);

  useEffect(() => {
    console.error('RouteError:', error);
  }, [error]);

  function handleRetry() {
    if (retriedOnceRef.current) {
      window.location.reload();
      return;
    }
    retriedOnceRef.current = true;
    try {
      reset();
    } catch {
      window.location.reload();
    }
  }

  return <ErrorFallback onRetry={handleRetry} />;
}
