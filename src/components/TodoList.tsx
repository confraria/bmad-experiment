'use client';

import { useTodos } from '@/hooks/useTodos';
import { TodoItem } from './TodoItem';
import { EmptyState } from './EmptyState';

export function TodoList() {
  const todos = useTodos();
  if (!todos || todos.length === 0) return <EmptyState />;

  return (
    <ul className="flex w-full list-none flex-col" aria-label="Todos">
      {todos.map((todo) => (
        <TodoItem key={todo.id} todo={todo} />
      ))}
    </ul>
  );
}
