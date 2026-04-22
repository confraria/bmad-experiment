'use client';

import { Component, type ReactNode } from 'react';
import { ErrorFallback } from './ErrorFallback';
import { getClientId } from '@/lib/clientId';

type AppErrorBoundaryProps = { children: ReactNode };
type AppErrorBoundaryState = { hasError: boolean };

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error): void {
    try {
      const payload = {
        message: error.message ?? '',
        stack: error.stack ?? '',
        clientId: getClientId(),
        userAgent: window.navigator.userAgent,
        url: window.location.href,
        caughtAt: 'app' as const,
      };
      void fetch('/api/errors', {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => undefined);
    } catch {
      // Fire-and-forget: never block the UI on reporting.
    }
  }

  private retry = (): void => {
    this.setState({ hasError: false });
  };

  render(): ReactNode {
    if (this.state.hasError) return <ErrorFallback onRetry={this.retry} />;
    return this.props.children;
  }
}
