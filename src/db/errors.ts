/** Turns low-level storage failures into a plain message a nurse can act on. */
export const STORAGE_FULL = 'Laptop storage is full, so this was NOT saved. Use the paper downtime form and tell the charge nurse or IT.';

export function isQuotaError(e: unknown): boolean {
  const seen = new Set<unknown>();
  let cur: unknown = e;
  while (cur && typeof cur === 'object' && !seen.has(cur)) {
    seen.add(cur);
    const x = cur as { name?: string; message?: string; inner?: unknown; cause?: unknown };
    if (x.name === 'QuotaExceededError' || /quota/i.test(x.message ?? '')) return true;
    cur = x.inner ?? x.cause;
  }
  return false;
}

/** Run a storage operation; a full disk becomes a clear error instead of a browser message. */
export async function guardStorage<T>(fn: () => Promise<T>, makeError: (msg: string) => Error = (m) => new Error(m)): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (isQuotaError(e)) throw makeError(STORAGE_FULL);
    throw e;
  }
}
