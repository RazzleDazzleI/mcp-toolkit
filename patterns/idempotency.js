/**
 * Idempotency for agent retries.
 *
 * Agents retry. A tool that appends on every call turns one timeout into four
 * duplicate records — and the agent has no way to know it already succeeded,
 * because the response it would have read never arrived.
 *
 * Either make the operation naturally idempotent, or take a caller-supplied
 * key and replay the first result. This is the second option.
 */

export function createIdempotencyCache({ max = 500 } = {}) {
  const seen = new Map(); // key -> result

  return {
    /**
     * @param {string|undefined} key  caller-supplied; when absent, no dedup
     * @param {() => Promise<any>} run
     */
    async once(key, run) {
      if (!key) return run();
      if (seen.has(key)) return seen.get(key);

      const result = await run();
      seen.set(key, result);

      // bounded — oldest out first
      if (seen.size > max) seen.delete(seen.keys().next().value);
      return result;
    },
    size: () => seen.size,
    clear: () => seen.clear(),
  };
}
