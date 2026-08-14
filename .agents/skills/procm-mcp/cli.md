# procm-mcp CLI reference

The `procm-mcp` CLI wraps the backend's HTTP API. It connects to an already
running backend (`procm-mcp --server`, or an MCP backend with
`PROCM_HTTP_PORT` set) — it never starts one. Source: `src/cli-client.ts`.

## Connection flags

Available on every subcommand:

| Flag | Env fallback | Default | Meaning |
|---|---|---|---|
| `--port <n>` | `PROCM_HTTP_PORT` | `7331` | Backend HTTP port |
| `--token <t>` | `PROCM_HTTP_TOKEN` | — | Sent as `Authorization: Bearer` when the backend is token-protected |

Connection refused → `cannot connect to backend ... Is "procm-mcp --server" running?`

## Commands

```
procm-mcp ping                                    reachability check
procm-mcp ps                                      list processes (live + history)
procm-mcp info <id>                               details of one process
procm-mcp logs <id> [--stream stdout|stderr] [-n 200]
procm-mcp grep <id> <pattern> [--stream s] [-n 50] [-i]
procm-mcp start <script> [args...] [--cwd <dir>] [--name <n>] [--env KEY=VAL ...]
procm-mcp restart <id>
procm-mcp stop <id>                               stop + delete
```

> There is **no** `input` subcommand — for stdin/signal use HTTP
> `POST /api/processes/:id/input` (see SKILL.md, "Input (stdin / signal)").

## mcptool — call MCP tools from the CLI

`mcptool` talks to the backend's `/mcp` endpoint (stateless Streamable HTTP,
JSON-RPC). Every MCP tool the backend registers is callable, with parameters
passed straight from the command line.

```
procm-mcp mcptool                                 list tools (name + one-line description)
procm-mcp mcptool <name>                          show the tool's description + input schema
procm-mcp mcptool <name> [key=value ...] [--args <json>] [--raw]   call the tool
```

### Passing arguments

Two styles, freely mixed (on conflict, `key=value` wins):

- **`key=value` tokens** — the value is coerced: `true`/`false` → boolean,
  valid numbers → number, JSON arrays/objects/`null` keep their JSON type,
  everything else stays a string.
- **`--args '<json>'`** — a single JSON object, for anything awkward to spell
  as `key=value` (nested objects, strings that look like numbers, etc.).

```bash
# list processes (MCP tool "process")
procm-mcp mcptool process action=list

# start one, mixing styles: --args carries the array, key=value overrides name
procm-mcp mcptool start-process \
  --args '{"script":"node","args":["-e","console.log(42)"],"cwd":"/tmp"}' \
  name=probe

# inspect a schema before calling
procm-mcp mcptool process-logs
```

### Output and exit codes

- Default: prints the tool's text content (`content[].text`), or
  `structuredContent` as JSON when there is no text.
- **`--raw`**: print raw JSON instead of the formatted output — the full
  `tools/call` result on a call, the tool entries on list/schema views. Use it
  when piping into `jq`.
- Tool errors (`isError: true`, e.g. validation failures) still print but exit
  with code `1`. Unknown tool / invalid `--args` / connection failures also
  exit non-zero with a message on stderr.
