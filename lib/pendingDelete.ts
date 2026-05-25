import type { Expense } from './types';

type PendingEntry = {
  expense: Expense;
  timer: ReturnType<typeof setTimeout>;
  commit: () => void;
};

const pending = new Map<string, PendingEntry>();
const listeners = new Set<() => void>();

export function getPendingIds(): Set<string> {
  return new Set(pending.keys());
}

export function isPending(id: string): boolean {
  return pending.has(id);
}

export function subscribePending(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  listeners.forEach((fn) => fn());
}

export function queuePendingDelete(
  expense: Expense,
  commit: () => Promise<void> | void,
  delayMs = 4000,
) {
  cancelPendingDelete(expense.id);
  const timer = setTimeout(async () => {
    pending.delete(expense.id);
    notify();
    try {
      await commit();
    } catch (err) {
      console.warn('Pending delete commit failed:', err);
    }
  }, delayMs);
  pending.set(expense.id, { expense, timer, commit: () => commit() });
  notify();
}

export function cancelPendingDelete(id: string): Expense | null {
  const entry = pending.get(id);
  if (!entry) return null;
  clearTimeout(entry.timer);
  pending.delete(id);
  notify();
  return entry.expense;
}

export function flushPendingDeletes() {
  for (const [id, entry] of pending) {
    clearTimeout(entry.timer);
    pending.delete(id);
    Promise.resolve(entry.commit()).catch((err) =>
      console.warn('Flush delete failed:', err),
    );
  }
  notify();
}
