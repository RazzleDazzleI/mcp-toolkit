#!/usr/bin/env node
/**
 * Minimal MCP client — exercise a server without a full agent host.
 *
 * The fastest way to find out whether a tool description is doing its job is
 * to read it back exactly as a model would receive it. `list-tools` prints
 * that verbatim.
 *
 *   npm run client -- list-tools  servers/sqlite.js
 *   npm run client -- call        servers/sqlite.js describe_schema
 *   npm run client -- call        servers/sqlite.js run_query '{"sql":"SELECT * FROM projects"}'
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const [cmd, serverPath, toolName, rawArgs] = process.argv.slice(2);

if (!cmd || !serverPath) {
  console.error('usage: client <list-tools|call> <server.js> [tool] [json-args]');
  process.exit(1);
}

const client = new Client({ name: 'mcp-toolkit-client', version: '0.1.0' });
await client.connect(new StdioClientTransport({ command: 'node', args: [serverPath] }));

try {
  if (cmd === 'list-tools') {
    const { tools } = await client.listTools();
    for (const t of tools) {
      console.log(`\n\x1b[1m${t.name}\x1b[0m — ${t.title ?? ''}`);
      console.log(`  ${t.description}`);
      const props = t.inputSchema?.properties ?? {};
      for (const [k, v] of Object.entries(props)) {
        const req = t.inputSchema?.required?.includes(k) ? '' : ' (optional)';
        console.log(`    ${k}${req}: ${v.description ?? v.type}`);
      }
    }
    console.log();
  } else if (cmd === 'call') {
    if (!toolName) throw new Error('call requires a tool name');
    const res = await client.callTool({
      name: toolName,
      arguments: rawArgs ? JSON.parse(rawArgs) : {},
    });
    if (res.isError) console.log('\x1b[31mTOOL ERROR\x1b[0m');
    for (const c of res.content ?? []) console.log(c.text ?? JSON.stringify(c));
  } else {
    throw new Error(`unknown command "${cmd}"`);
  }
} finally {
  await client.close();
}
