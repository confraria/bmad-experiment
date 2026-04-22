'use client';

import { useTodos } from '@/hooks/useTodos';
import { TodoItem } from './TodoItem';

export function TodoList() {
  const todos = useTodos();
  const items = todos ?? [];

  return (
    <ul className="flex w-full list-none flex-col" aria-label="Active todos">
      {items.map((todo) => (
        <TodoItem key={todo.id} todo={todo} />
      ))}
    </ul>
  );
}
