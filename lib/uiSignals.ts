import type { Expense } from './types';

type Listener = () => void;

let savedAt: number | null = null;
const savedListeners = new Set<Listener>();

export function signalReceiptSaved() {
  savedAt = Date.now();
  savedListeners.forEach((fn) => fn());
}

export function consumeReceiptSaved(): number | null {
  const at = savedAt;
  savedAt = null;
  return at;
}

export function subscribeReceiptSaved(fn: Listener): () => void {
  savedListeners.add(fn);
  return () => savedListeners.delete(fn);
}

type PendingDeletePayload = { expense: Expense };
let pendingDeleted: PendingDeletePayload | null = null;
const deleteListeners = new Set<Listener>();

export function signalExpenseDeleted(expense: Expense) {
  pendingDeleted = { expense };
  deleteListeners.forEach((fn) => fn());
}

export function consumeExpenseDeleted(): Expense | null {
  const payload = pendingDeleted;
  pendingDeleted = null;
  return payload?.expense ?? null;
}

export function subscribeExpenseDeleted(fn: Listener): () => void {
  deleteListeners.add(fn);
  return () => deleteListeners.delete(fn);
}
