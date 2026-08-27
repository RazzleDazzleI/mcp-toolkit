# mcp-toolkit

Production Model Context Protocol servers and agent workflows — the plumbing that lets an LLM operate real software instead of describing it.

I run these daily against live systems. This repo is a clean, dependency-light extraction of the patterns that survived that use.

## What's here

| | |
|---|---|
| `servers/` | Three MCP servers over stdio — a filesystem-scoped reader, an HTTP fetcher with an allowlist, and a SQLite query tool |
| `patterns/` | The reusable parts: tool-schema design, structured-error contracts, long-operation handling, and idempotency |
| `client/` | A minimal MCP client for exercising a server without a full agent host |
| `docs/` | Wiring notes, and the failure modes worth knowing about up front |

## Why MCP

An LLM given a text description of a system can only talk about it. Given tools, it can change it. MCP standardizes that boundary — the model discovers what's available at runtime instead of having capabilities hardcoded into a prompt.

The interesting engineering isn't the protocol, which is small. It's everything the protocol doesn't decide for you.

## What running these in production actually taught me

**Tool descriptions are prompts.** They're the only thing the model sees when deciding whether to call something. A parameter named `id` with no description gets guessed at. `id` documented as "the 32-character hex asset id returned by `list_assets`" gets looked up. Most tool-call failures I traced were description failures, not model failures.

**Return structured errors, never prose.** `{"error": "not_found", "hint": "call list_items first"}` gets recovered from. `"Sorry, something went wrong"` produces a retry loop with the same bad arguments. The error is part of the API surface and deserves the same design attention as the success path.

**State drifts underneath you.** One system I drive is a 3D editor a human also has open. I lost a full session to an agent writing to coordinates it had cached several steps earlier, after the object had been moved. The fix generalizes: for any shared mutable target, **measure at call time and derive from that** — never trust a value carried across turns.

**Reads can lie right after writes.** In the same editor, raycasts return stale collision data immediately after a voxel write, while the underlying voxel read is correct. Any tool wrapping an eventually-consistent system needs to expose which read is authoritative, or the agent will confidently act on the wrong one.

**Make idempotency explicit.** Agents retry. A tool that appends on every call turns one timeout into four duplicate records. Either make the operation naturally idempotent or take a caller-supplied key.

## Running it

```bash
npm install
npm run server:sqlite          # starts the SQLite MCP server on stdio
npm run client -- list-tools   # exercise it without an agent host
```

Register with any MCP-capable host by pointing it at the server command. `docs/wiring.md` has configs for the two hosts I've used.

## Stack

Node.js 22 · `@modelcontextprotocol/sdk` · SQLite (`better-sqlite3`) · zero runtime dependencies beyond those

## Notes

Everything here runs against synthetic fixtures in `fixtures/`. The production deployments this pattern set came from are private.
