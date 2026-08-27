# Failure modes

Things that cost me real time running MCP servers in production. None are in
the protocol spec; all of them are decisions the protocol leaves to you.

## Tool descriptions are prompts

The description is the *entire* basis on which a model decides whether to call
a tool and what to pass it. A parameter named `id` with no description gets
guessed at. The same parameter documented as *"the 32-character hex asset id
returned by `list_assets`"* gets looked up first.

Most tool-call failures I traced were description failures, not model failures.
Read your descriptions back the way a model receives them:

```bash
npm run client -- list-tools servers/sqlite.js
```

If a description doesn't say when to call the tool and what to call first,
it isn't finished.

## Return structured errors, never prose

`"Sorry, something went wrong"` produces a retry loop with identical arguments.
A code plus a hint produces a *different* second call:

```json
{ "error": "invalid_input", "message": "no such column: nope",
  "available": ["projects","runs"], "hint": "Call describe_schema for exact column names." }
```

The error is part of the API surface. It deserves the same design attention as
the success path. See `patterns/errors.js`.

## State drifts underneath you

One system I drive is a 3D editor a human also has open. I lost a session to an
agent writing to coordinates it had cached several steps earlier, after the
object had been moved — everything it built landed in mid-air.

**For any shared mutable target, measure at call time and derive from that.**
Never carry a position, id, or handle across turns and assume it still resolves.

## Reads can lie right after writes

In that same editor, raycasts return stale collision data immediately after a
voxel write while the voxel read is already correct. I chased a terrain defect
that did not exist.

If a tool wraps an eventually-consistent system, document which read is
authoritative — or the agent will confidently act on the wrong one.

## Make idempotency explicit

Agents retry, and a timeout is indistinguishable from a failure from the
client's side. A tool that appends on every call turns one timeout into four
duplicate records.

Either make the operation naturally idempotent, or accept a caller-supplied key
and replay the first result. See `patterns/idempotency.js`.

## Refuse rather than truncate

`read_file` rejects a file over the byte limit instead of returning the first
N bytes. Silent truncation means the agent reasons over a partial file believing
it is complete — and nothing downstream can detect that. A refusal it can see
is strictly better than a success it cannot verify.
