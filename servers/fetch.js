#!/usr/bin/env node
/**
 * HTTP fetcher with a host allowlist.
 *
 * An agent with an unrestricted fetch tool is an SSRF primitive: it will
 * happily be talked into requesting a cloud metadata endpoint or an internal
 * admin page by anything it reads. The allowlist is the whole point of this
 * server — the fetching itself is trivial.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { ErrorCode, toolError, ok } from '../patterns/errors.js';
import { createIdempotencyCache } from '../patterns/idempotency.js';

const ALLOWED = (process.env.MCP_FETCH_ALLOWLIST ?? 'example.com,httpbin.org')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const MAX_BYTES = Number(process.env.MCP_FETCH_MAX_BYTES ?? 512_000);
const TIMEOUT_MS = Number(process.env.MCP_FETCH_TIMEOUT_MS ?? 10_000);

const cache = createIdempotencyCache();

function hostAllowed(host) {
  const h = host.toLowerCase();
  return ALLOWED.some(a => h === a || h.endsWith(`.${a}`));
}

const server = new McpServer({ name: 'fetch-allowlisted', version: '0.1.0' });

server.registerTool('fetch_url', {
  title: 'Fetch URL',
  description:
    'HTTP GET a URL and return the response body as text. Only hosts on the ' +
    `server allowlist are permitted (currently: ${ALLOWED.join(', ')}). ` +
    'Redirects are followed only while they stay on allowlisted hosts.',
  inputSchema: {
    url: z.string().url().describe('Absolute http(s) URL on an allowlisted host'),
    idempotency_key: z.string().optional()
      .describe('Optional. Supply a stable key to have a retry replay the first result instead of re-requesting.'),
  },
}, async ({ url, idempotency_key }) => cache.once(idempotency_key, async () => {
  let parsed;
  try { parsed = new URL(url); }
  catch { return toolError(ErrorCode.INVALID_INPUT, `"${url}" is not a valid URL.`); }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return toolError(ErrorCode.INVALID_INPUT,
      `Protocol "${parsed.protocol}" is not supported.`, { hint: 'Use http or https.' });
  }
  if (!hostAllowed(parsed.hostname)) {
    return toolError(ErrorCode.OUT_OF_SCOPE,
      `Host "${parsed.hostname}" is not on the allowlist.`,
      { available: ALLOWED, hint: 'Request a host on the allowlist, or ask the operator to extend MCP_FETCH_ALLOWLIST.' });
  }

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(parsed, { signal: ac.signal, redirect: 'manual' });

    // Follow redirects manually so each hop is re-checked against the allowlist.
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) return toolError(ErrorCode.UPSTREAM, `${res.status} with no Location header.`);
      const next = new URL(loc, parsed);
      if (!hostAllowed(next.hostname)) {
        return toolError(ErrorCode.OUT_OF_SCOPE,
          `Redirect target "${next.hostname}" is not on the allowlist.`, { available: ALLOWED });
      }
      return ok({ redirect_to: next.href, status: res.status,
        note: 'Call fetch_url again with redirect_to.' });
    }

    const body = await res.text();
    if (body.length > MAX_BYTES) {
      return toolError(ErrorCode.TOO_LARGE,
        `Response is ${body.length} bytes, over the ${MAX_BYTES}-byte limit.`);
    }
    return ok({ status: res.status, content_type: res.headers.get('content-type'), body });
  } catch (err) {
    if (err.name === 'AbortError') {
      return toolError(ErrorCode.UPSTREAM, `Request timed out after ${TIMEOUT_MS}ms.`,
        { hint: 'The host may be slow or unreachable. Retrying with the same idempotency_key is safe.' });
    }
    return toolError(ErrorCode.UPSTREAM, err.message);
  } finally {
    clearTimeout(timer);
  }
}));

await server.connect(new StdioServerTransport());
