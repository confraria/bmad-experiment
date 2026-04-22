'use client';

import { useRef } from 'react';
import { animate } from 'motion/react';
import { updateTodo, softDeleteTodo } from '@/lib/db';
import type { Todo } from '@/lib/schema';
import { useUIStore } from '@/stores/useUIStore';

const SWIPE_THRESHOLD_PX = 80;

type TodoItemProps = {
  todo: Todo;
};

export function TodoItem({ todo }: TodoItemProps) {
  const liRef = useRef<HTMLLIElement>(null);
  const showUndoToast = useUIStore((s) => s.showUndoToast);
  const startX = useRef(0);
  const currentDeltaX = useRef(0);
  const isSwiping = useRef(false);
  const isPointerDown = useRef(false);

  async function onToggle() {
    if (isSwiping.current) return;
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

  function onPointerDown(event: React.PointerEvent<HTMLLIElement>) {
    startX.current = event.clientX;
    currentDeltaX.current = 0;
    isSwiping.current = false;
    isPointerDown.current = true;
  }

  function onPointerMove(event: React.PointerEvent<HTMLLIElement>) {
    if (!isPointerDown.current) return;
    const deltaX = event.clientX - startX.current;
    currentDeltaX.current = Math.min(0, deltaX);
    if (Math.abs(deltaX) > 5) {
      isSwiping.current = true;
    }
    if (liRef.current) {
      liRef.current.style.transform = `translateX(${currentDeltaX.current}px)`;
    }
  }

  function onPointerUp() {
    isPointerDown.current = false;
    if (isSwiping.current && currentDeltaX.current < -SWIPE_THRESHOLD_PX) {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        showUndoToast(todo.id, todo.text);
        void softDeleteTodo(todo.id).catch((err) =>
          console.error('TodoItem: softDeleteTodo failed', err),
        );
      } else {
        void animate(liRef.current!, { x: -window.innerWidth }, { duration: 0.2, ease: 'easeOut' }).then(() => {
          showUndoToast(todo.id, todo.text);
          return softDeleteTodo(todo.id).catch((err) =>
            console.error('TodoItem: softDeleteTodo failed', err),
          );
        });
      }
    } else {
      void animate(liRef.current!, { x: 0 }, { type: 'spring', stiffness: 400, damping: 40 });
    }
    isSwiping.current = false;
  }

  function onPointerCancel() {
    isPointerDown.current = false;
    isSwiping.current = false;
    void animate(liRef.current!, { x: 0 }, { type: 'spring', stiffness: 400, damping: 40 });
  }

  return (
    <li
      ref={liRef}
      data-todo-id={todo.id}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
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
