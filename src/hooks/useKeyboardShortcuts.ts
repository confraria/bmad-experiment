'use client';

import { useEffect } from 'react';
import { softDeleteTodo } from '@/lib/db';
import { useUIStore } from '@/stores/useUIStore';

const DESKTOP_QUERY = '(min-width: 1024px)';

function isEditableFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  if (el instanceof HTMLInputElement) return true;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLElement && el.isContentEditable) return true;
  return false;
}

function moveFocus(delta: 1 | -1): void {
  const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-todo-id]'));
  if (rows.length === 0) return;
  const focusedRow = document.activeElement?.closest<HTMLElement>('[data-todo-id]') ?? null;
  const currentIdx = focusedRow ? rows.indexOf(focusedRow) : -1;
  let nextIdx: number;
  if (currentIdx === -1) {
    nextIdx = delta === 1 ? 0 : rows.length - 1;
  } else {
    nextIdx = currentIdx + delta;
    if (nextIdx < 0 || nextIdx >= rows.length) return;
  }
  const btn = rows[nextIdx].querySelector<HTMLButtonElement>('button');
  btn?.focus();
}

function deleteFocusedRow(event: KeyboardEvent): void {
  const row = document.activeElement?.closest<HTMLElement>('[data-todo-id]');
  if (!row) return;
  const id = row.dataset.todoId;
  if (!id) return;
  const text = row.querySelector('button')?.textContent ?? '';
  event.preventDefault();
  const { showUndoToast } = useUIStore.getState();
  showUndoToast(id, text);
  void softDeleteTodo(id).catch((err) =>
    console.error('useKeyboardShortcuts: softDeleteTodo failed', err),
  );
}

function undoIfPending(event: KeyboardEvent): void {
  const { undoPendingTodo, undoPendingDelete } = useUIStore.getState();
  if (!undoPendingTodo) return;
  event.preventDefault();
  void undoPendingDelete();
}

function onKeyDown(event: KeyboardEvent): void {
  const modCombo = event.metaKey || event.ctrlKey;

  if (isEditableFocused()) return;

  if (modCombo && !event.shiftKey && event.key === 'Backspace') {
    deleteFocusedRow(event);
    return;
  }

  if (modCombo && !event.shiftKey && (event.key === 'z' || event.key === 'Z')) {
    undoIfPending(event);
    return;
  }

  if (modCombo) return;

  switch (event.key) {
    case 'j':
      moveFocus(1);
      return;
    case 'k':
      moveFocus(-1);
      return;
    case 'n':
      document.getElementById('add-todo-input')?.focus();
      return;
    case '?':
      useUIStore.getState().toggleHelpOverlay();
      return;
  }
}

export function useKeyboardShortcuts(): void {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia(DESKTOP_QUERY);
    let detach: (() => void) | null = null;

    const attachIfDesktop = () => {
      if (mql.matches && !detach) {
        window.addEventListener('keydown', onKeyDown);
        detach = () => window.removeEventListener('keydown', onKeyDown);
      } else if (!mql.matches && detach) {
        detach();
        detach = null;
      }
    };

    attachIfDesktop();
    mql.addEventListener('change', attachIfDesktop);

    return () => {
      mql.removeEventListener('change', attachIfDesktop);
      detach?.();
    };
  }, []);
}
