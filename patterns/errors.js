/**
 * Structured error contract.
 *
 * An agent recovers from an error only if the error tells it what to do next.
 * Prose ("something went wrong") produces a retry loop with the same bad
 * arguments. A code plus a hint produces a different second call.
 *
 * Every tool in this repo fails through `toolError`, so the shape is uniform
 * across servers and an agent learns it once.
 */

export const ErrorCode = {
  NOT_FOUND:      'not_found',
  INVALID_INPUT:  'invalid_input',
  OUT_OF_SCOPE:   'out_of_scope',
  CONFLICT:       'conflict',
  UPSTREAM:       'upstream_error',
  TOO_LARGE:      'too_large',
};

/**
 * @param {string} code  one of ErrorCode
 * @param {string} message  what happened, stated plainly
 * @param {object} [extra]
 * @param {string} [extra.hint]  the next call that would succeed
 * @param {string[]} [extra.available]  valid values, when the set is small
 */
export function toolError(code, message, extra = {}) {
  const payload = { error: code, message, ...extra };
  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
  };
}

export function ok(data) {
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  return { content: [{ type: 'text', text }] };
}
