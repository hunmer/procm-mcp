# procm-mcp

A Model Context Protocol (MCP) server for process management.

## Supported features

- Secure and automatable process creation
- Cleanup created processes automatically on termination (e.g. exiting claude code)
- Common process management features supported, restarting, deleting, checking status or retreving stdout/stderr of processes
- Room-based WebSocket messaging, retained readiness signals, structured logs, and batch process operations

Using these features, LLMs start processes like development servers, docker-compose, or test watchers and check their outputs to fix bugs automatically.

## Install globally (for development)

If you're developing procm-mcp itself and want the `procm-mcp` command available in **any** terminal pointing at your working copy, run:

```bash
npm run link
```

This builds the project and registers it globally via `npm link`. The global command is a link (junction) to this checkout, so every `npm run build` (or `npm run link`) is automatically reflected — no reinstall needed. If the npm global bin directory isn't on your PATH, the script attempts to add it (User PATH on Windows; prints instructions on other platforms). Open a **new** terminal afterwards, then:

```bash
procm-mcp --help
procm-mcp --server            # run as an HTTP backend
```

To undo: `npm unlink -g procm-mcp`.

## Dashboard (HTTP)

An optional web dashboard lets you view and manage running processes from a browser. It is **off by default** and, when enabled, binds only to `127.0.0.1` so it is not reachable from the network.

The dashboard is a React + coss frontend (in `dashboard/`). It is served pre-built: the Node backend serves `dashboard/dist/index.html` and its `/assets/*` bundle. When you install procm-mcp from npm the built bundle ships inside the package. If you develop procm-mcp itself and run from source, build the dashboard first:

```bash
npm run build:dashboard   # builds dashboard/ -> dashboard/dist
# or build everything (dashboard + backend):
npm run build
```

If the bundle is missing, `GET /` returns a small "dashboard not built" page with the command to run instead of failing; the REST API still works.

Enable it by setting `PROCM_HTTP_PORT` in the MCP server environment:

```json
{
  "mcpServers": {
    "procm-mcp": {
      "command": "node",
      "args": ["./node_modules/procm-mcp/build/index.js"],
      "env": { "PROCM_HTTP_PORT": "7331" }
    }
  }
}
```

Then open `http://127.0.0.1:7331`. Optional `PROCM_HTTP_TOKEN` requires an `Authorization: Bearer <token>` header on every request.

The dashboard can list processes, view stdout/stderr, and start, stop, or restart processes. Starting a process from the dashboard is a human-driven localhost action, equivalent to running the command yourself in a terminal.

HTTP API (same origin):

- `GET  /` → dashboard page
- `GET  /api/processes` → list of processes `{ serverId, pid, processes: [...] }`
- `GET  /api/processes/:id` → single process detail
- `GET  /api/processes/:id/logs?stream=stdout|stderr&count=200` → recent log lines
- `POST /api/processes` → start a process (body: `{ script, name?, args?, cwd, envs?, desc?, port?, roomId?, group? }`)
- `POST /api/processes/:id/stop` → stop and retain its history
- `POST /api/processes/:id/restart` → restart
- `GET /api/rooms` → list room metadata and active members
- `GET|PATCH /api/rooms/:roomId` → inspect or update room title/note
- `GET /api/rooms/:roomId/logs?memberPrefix=&level=&traceId=&count=` → merged structured room logs

### Backend mode (`--server`)

By default procm-mcp runs as an MCP server over stdio (with the dashboard optional via `PROCM_HTTP_PORT`). Pass `--server` to run it as a **standalone HTTP backend**: no MCP stdio transport, the dashboard always starts, and the process stays alive to serve it. Useful for running procm-mcp as a long-lived background service that you (or another tool) drive purely over HTTP.

```bash
# Dashboard on the default port 7331
node ./node_modules/procm-mcp/build/index.js --server

# Or pick a port
node ./node_modules/procm-mcp/build/index.js --server --port 8080

# Keep this instance's process history and logs isolated
node ./node_modules/procm-mcp/build/index.js --server --port 8080 --data-path .procm-mcp-data
```

`--port <number>` also works in the default (stdio) mode to start the dashboard without setting `PROCM_HTTP_PORT`. It takes precedence over `PROCM_HTTP_PORT`.

`--data-path <path>` selects the directory used for process history, rooms, and logs. Relative paths are resolved from the current working directory. It takes precedence over `PROCM_MCP_DIR`; without either setting, data is stored under the system temporary directory.

### Connect over HTTP (`type: "http"`)

When procm-mcp runs with an HTTP port (`--server`, or `--port`/`PROCM_HTTP_PORT`), it exposes a real MCP endpoint at **`/mcp`** using the Streamable HTTP transport. This lets you connect a client that only speaks MCP-over-HTTP instead of stdio.

First run the backend (e.g. in a separate terminal / as a service):

```bash
node ./node_modules/procm-mcp/build/index.js --server --port 7331
```

Then point your MCP client at it:

```json
{
  "mcpServers": {
    "procm-mcp": {
      "type": "http",
      "url": "http://127.0.0.1:7331/mcp"
    }
  }
}
```

Notes:
- Process, batch, log, command, and room tools are available over `/mcp`. Stdio additionally exposes `process-input` (write to a process's stdin / send a signal).
- Process state is shared: a process started via `/mcp` is visible in the dashboard and REST API, and vice versa.
- If `PROCM_HTTP_TOKEN` is set, add it to the client config (`"headers": { "Authorization": "Bearer <token>" }`) where supported.
- `/mcp` runs in **stateless** mode (no session ID) — each request is independent.

## procm-commands.json

Define reusable named commands in a `procm-commands.json` file at the root of your project:

```json
{
  "commands": {
    "dev": { "script": "npm", "args": ["run", "dev"] },
    "test": { "script": "npm", "args": ["test"], "cwd": "." },
    "db": { "script": "docker", "args": ["compose", "up"], "envs": { "COMPOSE_FILE": "docker-compose.yml" } }
  }
}
```

The `procm-command` tool (action `list`) returns the file's contents and the available command names. Use `procm-command` (action `start`) to start one by name. Each command's `cwd` is resolved relative to the project directory (the directory containing `procm-commands.json`).

## Installation

```bash
npm i -D procm-mcp
```

Room clients install the separately published TypeScript SDK:

```bash
npm i @procm-mcp/sdk
```

```ts
import { createLogger, createProcmClient } from "@procm-mcp/sdk";

const client = createProcmClient({ clientName: "backend" });
const logger = createLogger({ client });

client.subscribe("debug:", (message) => console.log(message.payload), { prefix: true });
client.publish("backend:ready", { initialized: true }, { retain: true });
await client.waitFor("frontend:ready", { timeout: 30_000 });
logger.info("Backend ready", { pid: process.pid });
```

### Function hooks and in-memory traces

Trace storage is built into each procm-mcp process and requires no external service. Traces expire after 24 hours by default. `PROCM_TRACE_TTL_SECONDS` changes the default and accepts `1..604800` seconds. A trace is limited to 256 KiB after JSON serialization, and the LRU cache is bounded to 64 MiB total.

```ts
import { createHook, createLogger, createProcmClient, saveTrace } from "@procm-mcp/sdk";

const client = createProcmClient({ clientName: "backend" });
const logger = createLogger({ client });

const fetchUser = createHook(async (id: string) => ({ id }), {
  client,
  name: "fetchUser",
  captureArgs: true,
  captureResult: true,
});

fetchUser.before(({ traceId, args }) => {
  logger.info("fetchUser called", { userId: args[0] as string }, { traceId });
});

const user = await fetchUser("42");
const diagnosticId = await saveTrace(client, { kind: "diagnostic", user });
```

`createHook` preserves `this`, synchronous return types, Promise behavior, and original thrown/rejected errors. Its synchronous `before` handlers may call `setArgs()` or `skip()`; synchronous `after` handlers may call `setResult()`. Argument/result capture is off by default. `hookProperty()` supports only configurable own properties and returns an idempotent restore function. Runtime locations are V8 JavaScript locations; source-map conversion and interception of local variables, closures, or read-only ESM bindings are not supported.

Hook trace storage is asynchronous and never writes trace details or storage status to the application console. `saveTrace()` is the explicit confirmation API and resolves only after the current procm-mcp instance accepts the record. Timeout, abort, disconnect, invalid TTL, unsafe JSON, and oversized payloads reject without leaking pending requests.

Use the `trace-get` MCP tool on the same HTTP Stream MCP instance with `{ "id": "<traceId>" }`. It returns `{ "ok": true, "trace": ... }`, or `{ "ok": false, "error": ... }` with one of these stable codes: `TRACE_NOT_FOUND`, `TRACE_INVALID_ID`, `TRACE_INVALID_PAYLOAD`, `TRACE_STORE_CONFLICT`, `TRACE_STORE_ERROR`, or `TRACE_REQUEST_TIMEOUT`.

Trace data is intentionally ephemeral. Restarting procm-mcp clears it, LRU eviction may remove older entries before their TTL, and separate procm-mcp processes do not share traces.

Trace verification:

```bash
npm run build:sdk
npm run build
npm test
npm run test:trace
npm run test:custom-noise
```

Managed processes receive `PROCM_ROOM_ID`, `PROCM_PROCESS_ID`, `PROCM_WS_URL`, and optional authentication automatically. Explicit SDK options override environment values. See `demo/` for the Node.js and Electron workflow.

`.mcp.json`

```json
{
  "mcpServers": {
    "procm-mcp": {
      "command": "node",
      "args": ["./node_modules/procm-mcp/build/index.js"],
      "env": {}
    }
  }
}
```

## Process creation has no built-in gate

`start-process` and `procm-command` (action `start`) execute the given command directly. procm-mcp does **not** restrict which commands can be started — there is no whitelist, allow-list, or approval gate. Treat `start-process` like any tool that runs arbitrary shell commands: keep it under human confirmation (the default in most MCP clients) and only run procm-mcp where the command set it implies is acceptable.

For network-facing setups, optional `PROCM_HTTP_TOKEN` requires an `Authorization: Bearer <token>` header on every HTTP / `/mcp` / dashboard request, so the locally-bound server is not driven by anything else that can reach `127.0.0.1`.

## Tools

- `start-process` Start a new process with specified script and arguments
  - `script` (required): The script/command to execute
  - `cwd` (required): Working directory for the process
  - `args` (optional): Array of arguments to pass to the script
  - `name` (optional): A friendly name for the process
  - `envs` (optional): Environment variables to set for the process
  - `desc` (optional): A human-readable description
  - `port` (optional): Served port metadata
  - `roomId` (optional): Room to join; preserved across restart
  - `group` (optional): Dashboard grouping label; preserved across restart
- `batch-process` Start or restart up to 100 processes with bounded concurrency and per-item results
- `process` Manage a process by ID, or list all processes
  - `action` (required): `get` | `delete` | `restart` | `list`
  - `id` (required for get/delete/restart): The process ID
  - `delete` stops and removes a process by ID. The default signal is SIGTERM, but SIGKILL (force killing) is sent after 10 seconds unless the process exits.
- `process-logs` Read a process's logs by ID (tail recent, or grep with a regex)
- `process-log-files` Return absolute stdout/stderr log file paths for a process, including history
- `log-files` List historical process log files with absolute paths, optionally filtered by process and stream
  - `id` (required): The process ID
  - `pattern` (optional): A regular expression. If omitted, tails the most recent chunks instead of searching.
  - `stream` (optional): `"stdout"` or `"stderr"`. Tail defaults to `"stdout"`; in grep mode, omit to search both.
  - `count` (optional): Number of entries to return (tail default: 10, grep default: 50)
  - `ignoreCase` (optional): Case-insensitive matching (default: false)
- `process-input` Write to a process's stdin or send it an OS signal (stdio MCP only — not exposed over `/mcp`; use the dashboard or REST instead)
  - `id` (required): The process ID
  - `text` (optional): String to write to the process's stdin
  - `newline` (optional): Append a trailing newline to `text` (default: true; set false to send raw bytes)
  - `signal` (optional): Send an OS signal instead — one of `SIGINT` `SIGTERM` `SIGKILL` `SIGHUP` `SIGUSR1` `SIGUSR2` `SIGTSTP` `SIGCONT` `SIGQUIT`. Provide exactly one of `text` / `signal`.
- `procm-command` Manage processes defined in `procm-commands.json`
  - `action` (required): `list` | `start`
  - `name` (required for start): The command name as defined in the file
  - `cwd` (optional): Project directory containing `procm-commands.json` (default: current working directory)
- `room` List, inspect, or update room metadata and active members
- `room-logs` Merge structured logs for a room with optional member-prefix, level, and trace-ID filters
- `trace-get` Read a complete in-memory trace by exact ID from the current procm-mcp instance

## License

MIT
