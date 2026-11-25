// Runs a job on many items, a few at a time (polite to the servers we call).
// Used by the link checker and the radio stream check.

/**
 * Runs `work` on every item, but never more than `limit` at once.
 * `<T, R>` is a generic: "any type T in, any type R out".
 */
export async function inBatches<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await work(items[index] as T);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}
