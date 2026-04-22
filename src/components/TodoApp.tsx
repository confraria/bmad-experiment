'use client';

import { useSync } from '@/hooks/useSync';
import { AddTodoInput } from './AddTodoInput';
import { OfflineIndicator } from './OfflineIndicator';
import { TodoList } from './TodoList';
import { UndoToast } from './UndoToast';

export function TodoApp() {
  useSync();

  return (
    <div className="flex min-h-full w-full flex-col">
      <AddTodoInput />
      <main className="mx-auto flex w-full max-w-[600px] flex-1 flex-col px-6 pb-32 pt-2 lg:px-8 lg:pb-8 lg:pt-2">
        <TodoList />
      </main>
      <UndoToast />
      <OfflineIndicator />
    </div>
  );
}
