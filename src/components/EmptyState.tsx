'use client';

// Intentionally renders nothing. The UX spec explicitly rejects onboarding
// copy or tutorial illustrations — the AddTodoInput placeholder is the
// entire empty-state affordance. This component exists only to name the
// branch so any future product decision to add polish lands in one file.
export function EmptyState() {
  return null;
}
