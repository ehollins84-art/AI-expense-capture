type Listener = () => void;

let savedAt: number | null = null;
const listeners = new Set<Listener>();

export function signalReceiptSaved() {
  savedAt = Date.now();
  listeners.forEach((fn) => fn());
}

export function consumeReceiptSaved(): number | null {
  const at = savedAt;
  savedAt = null;
  return at;
}

export function subscribeReceiptSaved(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
