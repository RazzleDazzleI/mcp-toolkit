# Wiring these into a host

All three servers speak MCP over stdio, so any MCP-capable host can run them
with a command and arguments.

## Claude Code

```bash
claude mcp add --transport stdio sqlite -- node /abs/path/to/servers/sqlite.js
```

## Config-file hosts

```json
{
  "mcpServers": {
    "sqlite":     { "command": "node", "args": ["/abs/path/servers/sqlite.js"] },
    "files":      { "command": "node", "args": ["/abs/path/servers/filesystem.js"],
                    "env": { "MCP_FS_ROOT": "/abs/path/fixtures/files" } },
    "fetch":      { "command": "node", "args": ["/abs/path/servers/fetch.js"],
                    "env": { "MCP_FETCH_ALLOWLIST": "example.com,docs.internal" } }
  }
}
```

**Use absolute paths.** Hosts do not agree on the working directory a server
starts in, and a relative path that works in one fails silently in another.

## Configuration

| Variable | Default | Server |
|---|---|---|
| `MCP_FS_ROOT` | `fixtures/files` | filesystem |
| `MCP_FS_MAX_BYTES` | `256000` | filesystem |
| `MCP_FETCH_ALLOWLIST` | `example.com,httpbin.org` | fetch |
| `MCP_FETCH_MAX_BYTES` | `512000` | fetch |
| `MCP_FETCH_TIMEOUT_MS` | `10000` | fetch |
| `MCP_SQLITE_PATH` | `fixtures/demo.db` | sqlite |
| `MCP_SQLITE_MAX_ROWS` | `200` | sqlite |

## Gotcha: stdout belongs to the protocol

A stray `console.log` in a stdio server corrupts the JSON-RPC stream and the
host disconnects with an unhelpful parse error. **Log to stderr.** Every
diagnostic in these servers uses `console.error` for exactly this reason.
