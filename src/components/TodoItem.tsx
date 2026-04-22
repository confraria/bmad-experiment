'use client';

import type { Todo } from '@/lib/schema';

type TodoItemProps = {
  todo: Todo;
};

export function TodoItem({ todo }: TodoItemProps) {
  return (
    <li
      data-todo-id={todo.id}
      className="py-3 text-base leading-[1.5] text-foreground break-words"
    >
      {todo.text}
    </li>
  );
}
