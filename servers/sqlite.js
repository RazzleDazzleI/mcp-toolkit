#!/usr/bin/env node
/**
 * Read-only SQLite query tool.
 *
 * Opened readonly at the driver level rather than filtered with a regex.
 * Statement blocklists are a losing game; the connection simply cannot write.
 *
 * `describe_schema` exists because an agent that cannot see the schema will
 * invent column names. Giving it the schema up front costs one call and
 * removes most invalid-query retries.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import Database from 'better-sqlite3';
import { ErrorCode, toolError, ok } from '../patterns/errors.js';

const DB_PATH = process.env.MCP_SQLITE_PATH ?? 'fixtures/demo.db';
const MAX_ROWS = Number(process.env.MCP_SQLITE_MAX_ROWS ?? 200);

let db;
try {
  db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
} catch (err) {
  console.error(`[sqlite] cannot open ${DB_PATH}: ${err.message}`);
  console.error('[sqlite] run `npm run seed` to create the demo database.');
  process.exit(1);
}

const tableNames = () =>
  db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .all().map(r => r.name);

const server = new McpServer({ name: 'sqlite-readonly', version: '0.1.0' });

server.registerTool('describe_schema', {
  title: 'Describe schema',
  description:
    'Return every table with its columns and types. Call this before run_query — ' +
    'querying invented column names is the most common way a query fails here.',
  inputSchema: {},
}, async () => {
  const schema = tableNames().map(name => ({
    table: name,
    columns: db.prepare(`PRAGMA table_info(${JSON.stringify(name)})`).all()
      .map(c => ({ name: c.name, type: c.type, nullable: !c.notnull })),
  }));
  return ok(schema);
});

server.registerTool('run_query', {
  title: 'Run query',
  description:
    'Execute a read-only SELECT and return the rows. The connection is opened ' +
    `readonly, so writes fail at the driver. At most ${MAX_ROWS} rows are returned — ` +
    'add LIMIT and OFFSET to page through more.',
  inputSchema: {
    sql: z.string().describe('A single SELECT statement. Use describe_schema first for column names.'),
  },
}, async ({ sql }) => {
  const trimmed = sql.trim();
  if (!/^(select|with)\b/i.test(trimmed)) {
    return toolError(ErrorCode.INVALID_INPUT,
      'Only SELECT (or WITH ... SELECT) statements are accepted.',
      { hint: 'This connection is read-only. Rewrite the statement as a SELECT.' });
  }

  try {
    const rows = db.prepare(trimmed).all();
    return ok({
      row_count: rows.length,
      truncated: rows.length > MAX_ROWS,
      rows: rows.slice(0, MAX_ROWS),
    });
  } catch (err) {
    // SQLite's "no such column/table" messages are useful — pass them through
    // with the valid table list so the retry has something to work from.
    return toolError(ErrorCode.INVALID_INPUT, err.message, {
      available: tableNames(),
      hint: 'Call describe_schema for exact column names.',
    });
  }
});

await server.connect(new StdioServerTransport());
