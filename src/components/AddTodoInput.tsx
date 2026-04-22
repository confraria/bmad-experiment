'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { NewTodoInputSchema } from '@/lib/schema';
import { putTodo } from '@/lib/db';

export function AddTodoInput() {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (window.matchMedia('(min-width: 1024px)').matches) {
      inputRef.current?.focus();
    }
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const parsed = NewTodoInputSchema.safeParse({ text });
    if (!parsed.success) return;

    try {
      await putTodo({ text: parsed.data.text });
      setText('');
    } catch (err) {
      console.error('AddTodoInput: putTodo failed', err);
      return;
    } finally {
      inputRef.current?.focus();
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="fixed inset-x-0 bottom-0 border-t border-border bg-background px-6 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] lg:static lg:border-0 lg:bg-transparent lg:px-8 lg:py-6"
    >
      <div className="mx-auto flex w-full max-w-[600px]">
        <label htmlFor="add-todo-input" className="sr-only">
          Add a task
        </label>
        <input
          id="add-todo-input"
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a task…"
          autoComplete="off"
          enterKeyHint="done"
          className="w-full min-h-11 rounded-md bg-transparent px-3 py-3 text-lg leading-tight text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
        />
      </div>
    </form>
  );
}
