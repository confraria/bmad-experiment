'use client';

import { updateTodo } from '@/lib/db';
import type { Todo } from '@/lib/schema';

type TodoItemProps = {
  todo: Todo;
};

export function TodoItem({ todo }: TodoItemProps) {
  async function onToggle() {
    try {
      await updateTodo(todo.id, { completed: !todo.completed });
    } catch (err) {
      console.error('TodoItem: updateTodo failed', err);
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== ' ') return;
    event.preventDefault();
    void onToggle();
  }

  return (
    <li data-todo-id={todo.id}>
      <button
        type="button"
        aria-pressed={todo.completed}
        onClick={onToggle}
        onKeyDown={onKeyDown}
        className={[
          'w-full min-h-11 py-3 text-left text-base leading-[1.5] break-words',
          'transition-[color,opacity,text-decoration-color] duration-[var(--duration-base)] ease-out',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          todo.completed ? 'line-through text-muted-foreground opacity-60' : 'text-foreground',
        ].join(' ')}
      >
        {todo.text}
      </button>
    </li>
  );
}
