'use client';

import { useTodos } from '@/hooks/useTodos';
import { TodoItem } from './TodoItem';
import { EmptyState } from './EmptyState';

export function TodoList() {
  const todos = useTodos();
  if (!todos || todos.length === 0) return <EmptyState />;

  const active = todos.filter((t) => !t.completed);
  const completed = todos.filter((t) => t.completed);

  return (
    <>
      {active.length > 0 && (
        <ul className="flex w-full list-none flex-col" aria-label="Todos">
          {active.map((todo) => (
            <TodoItem key={todo.id} todo={todo} />
          ))}
        </ul>
      )}
      {completed.length > 0 && (
        <ul className={`flex w-full list-none flex-col${active.length > 0 ? ' mt-6' : ''}`}>
          {completed.map((todo) => (
            <TodoItem key={todo.id} todo={todo} />
          ))}
        </ul>
      )}
    </>
  );
}
