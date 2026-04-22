'use client';

import { useOnlineStatus } from '@/hooks/useOnlineStatus';

export function OfflineIndicator() {
  const online = useOnlineStatus();
  return (
    <div
      role="status"
      aria-label="Offline"
      aria-hidden={online}
      className={[
        'pointer-events-none fixed right-3 top-3 z-40 h-1.5 w-1.5 rounded-full bg-muted-foreground',
        'transition-opacity duration-200',
        online ? 'opacity-0' : 'opacity-100',
      ].join(' ')}
    />
  );
}
