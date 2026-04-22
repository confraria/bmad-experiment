'use client';

import { AddTodoInput } from './AddTodoInput';

export function TodoApp() {
  return (
    <div className="flex min-h-full w-full flex-col">
      <AddTodoInput />
      <main className="mx-auto flex w-full max-w-[600px] flex-1 flex-col px-6 pb-32 pt-2 lg:px-8 lg:pb-8 lg:pt-2">
        {/* Story 1.4 will render <TodoList /> here */}
      </main>
    </div>
  );
}
