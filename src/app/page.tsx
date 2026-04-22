import { AppErrorBoundary } from '@/components/AppErrorBoundary';
import { TodoApp } from '@/components/TodoApp';

export default function Page() {
  return (
    <AppErrorBoundary>
      <TodoApp />
    </AppErrorBoundary>
  );
}
