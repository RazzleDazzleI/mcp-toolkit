#!/usr/bin/env node
/**
 * Scoped filesystem reader.
 *
 * Serves files from one root directory and refuses everything outside it.
 * The scope check resolves symlinks before comparing, because `realpath` is
 * the only comparison that survives a symlink pointing out of the sandbox.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { resolve, relative, isAbsolute, join } from 'node:path';
import { ErrorCode, toolError, ok } from '../patterns/errors.js';

const ROOT = resolve(process.env.MCP_FS_ROOT ?? 'fixtures/files');
const MAX_BYTES = Number(process.env.MCP_FS_MAX_BYTES ?? 256_000);

/** Resolve a caller path inside ROOT, or null if it escapes. */
async function safeResolve(rel) {
  const candidate = resolve(ROOT, rel);
  try {
    const real = await realpath(candidate);
    const rootReal = await realpath(ROOT);
    const r = relative(rootReal, real);
    return (r === '' || (!r.startsWith('..') && !isAbsolute(r))) ? real : null;
  } catch {
    // Path doesn't exist yet — validate the lexical form instead.
    const r = relative(ROOT, candidate);
    return (!r.startsWith('..') && !isAbsolute(r)) ? candidate : null;
  }
}

const server = new McpServer({ name: 'filesystem-scoped', version: '0.1.0' });

server.registerTool('list_files', {
  title: 'List files',
  description:
    'List files and directories directly under a path, relative to the server root. ' +
    'Use "." for the root itself. Call this before read_file when you do not already ' +
    'know an exact filename.',
  inputSchema: {
    path: z.string().default('.')
      .describe('Directory path relative to the server root, e.g. "." or "reports"'),
  },
}, async ({ path }) => {
  const dir = await safeResolve(path);
  if (!dir) return toolError(ErrorCode.OUT_OF_SCOPE,
    `Path "${path}" resolves outside the server root.`,
    { hint: 'Use a relative path such as "." or "subdir".' });

  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return ok(entries.map(e => ({
      name: e.name,
      type: e.isDirectory() ? 'directory' : 'file',
    })));
  } catch (err) {
    if (err.code === 'ENOENT') {
      return toolError(ErrorCode.NOT_FOUND, `No directory at "${path}".`,
        { hint: 'Call list_files with path "." to see what exists.' });
    }
    return toolError(ErrorCode.UPSTREAM, err.message);
  }
});

server.registerTool('read_file', {
  title: 'Read file',
  description:
    'Read a UTF-8 text file relative to the server root. Returns the whole file ' +
    `if it is under ${MAX_BYTES} bytes; larger files are refused rather than truncated, ` +
    'so you never reason over a partial file without knowing it.',
  inputSchema: {
    path: z.string()
      .describe('File path relative to the server root, as returned by list_files'),
  },
}, async ({ path }) => {
  const file = await safeResolve(path);
  if (!file) return toolError(ErrorCode.OUT_OF_SCOPE,
    `Path "${path}" resolves outside the server root.`);

  try {
    const info = await stat(file);
    if (info.isDirectory()) {
      return toolError(ErrorCode.INVALID_INPUT, `"${path}" is a directory.`,
        { hint: 'Use list_files for directories.' });
    }
    if (info.size > MAX_BYTES) {
      return toolError(ErrorCode.TOO_LARGE,
        `"${path}" is ${info.size} bytes, over the ${MAX_BYTES}-byte limit.`,
        { hint: 'Raise MCP_FS_MAX_BYTES on the server if this file is genuinely needed.' });
    }
    return ok(await readFile(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') {
      const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '.';
      return toolError(ErrorCode.NOT_FOUND, `No file at "${path}".`,
        { hint: `Call list_files with path "${dir}" to see valid names.` });
    }
    return toolError(ErrorCode.UPSTREAM, err.message);
  }
});

await server.connect(new StdioServerTransport());
