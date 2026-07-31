# procm-mcp

A Model Context Protocol (MCP) server for process management.

## Supported features

- Secure and automatable process creation
- Cleanup created processes automatically on termination (e.g. exiting claude code)
- Common process management features supported, restarting, deleting, checking status or retreving stdout/stderr of processes

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
npm run build:all
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

The dashboard can list processes, view stdout/stderr, and start, stop, or restart processes. **Starting a process from the dashboard intentionally bypasses the allow-x gate** — the dashboard is a human-driven localhost UI, so starting a process there is equivalent to running the command yourself in a terminal. The allow-x gate only governs the LLM/MCP path.

HTTP API (same origin):

- `GET  /` → dashboard page
- `GET  /api/processes` → list of processes `{ serverId, pid, processes: [...] }`
- `GET  /api/processes/:id` → single process detail
- `GET  /api/processes/:id/logs?stream=stdout|stderr&count=200` → recent log lines
- `POST /api/processes` → start a process (body: `{ script, name?, args?, cwd, envs? }`)
- `POST /api/processes/:id/stop` → stop and delete
- `POST /api/processes/:id/restart` → restart

### Backend mode (`--server`)

By default procm-mcp runs as an MCP server over stdio (with the dashboard optional via `PROCM_HTTP_PORT`). Pass `--server` to run it as a **standalone HTTP backend**: no MCP stdio transport, the dashboard always starts, and the process stays alive to serve it. Useful for running procm-mcp as a long-lived background service that you (or another tool) drive purely over HTTP.

```bash
# Dashboard on the default port 7331
node ./node_modules/procm-mcp/build/index.js --server

# Or pick a port
node ./node_modules/procm-mcp/build/index.js --server --port 8080
```

`--port <number>` also works in the default (stdio) mode to start the dashboard without setting `PROCM_HTTP_PORT`. It takes precedence over `PROCM_HTTP_PORT`.

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
- The same 5 tools are available over `/mcp` as over stdio, and the **allow-x gate still applies** (the HTTP MCP path is treated like the LLM/MCP path, not like the human-driven dashboard).
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

The `procm-command` tool (action `list`) returns the file's contents and the available command names. Use `procm-command` (action `start`) to start one by name. Each command's `cwd` is resolved relative to the project directory (the directory containing `procm-commands.json`). Starting a command **still goes through the allow-x gate**, so you must allow the exact script/args/cwd first with `allowed-process`.

## Installation

```bash
npm i -D procm-mcp
```

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

## Secure process creation

You can permit LLMs to use `start-process` tool without confirmation, because procm-mcp only allow whitelisted process creations.

LLMs will ask you to use the `allowed-process` tool (action `allow`) to add specific process creation to the whitelist.

Once you allow a process creation, you don't have to confirming it anymore as long as the command and the working directory are the same.

I call it "allow-x pattern", which can balances security and usability in MCP.

**Warning: Do not permit LLMs to use `allowed-process` without confirmation.That means "Do anything you want to".**

### Disabling the gate (`--allow-all`)

In trusted environments you can disable the gate entirely so `start-process` and `procm-command` (action `start`) run without pre-approval:

- CLI flag: `--allow-all`
- Env var: `PROCM_ALLOW_ALL=1` (also accepts `true`/`yes`/`on`)

When enabled, the server prints a `WARNING — allow-start-process gate is DISABLED` banner on startup. This flag only affects the **LLM/MCP** path (`start-process` / `procm-command`); the HTTP dashboard already starts processes without the gate since it is a human-driven UI.

> ⚠️ **Dangerous.** With `--allow-all`, an LLM can start any process without confirmation. Only use it in sandboxed, throwaway, or otherwise trusted environments — never expose it to untrusted clients or networks.

## Tools

- `start-process` Start a new process with specified script and arguments
  - `script` (required): The script/command to execute
  - `cwd` (required): Working directory for the process
  - `args` (optional): Array of arguments to pass to the script
  - `name` (optional): A friendly name for the process
  - `envs` (optional): Environment variables to set for the process
  - `desc` (optional): A human-readable description
- `process` Manage a process by ID, or list all processes
  - `action` (required): `get` | `delete` | `restart` | `list`
  - `id` (required for get/delete/restart): The process ID
  - `delete` stops and removes a process by ID. The default signal is SIGTERM, but SIGKILL (force killing) is sent after 10 seconds unless the process exits.
- `process-logs` Read a process's logs by ID (tail recent, or grep with a regex)
  - `id` (required): The process ID
  - `pattern` (optional): A regular expression. If omitted, tails the most recent chunks instead of searching.
  - `stream` (optional): `"stdout"` or `"stderr"`. Tail defaults to `"stdout"`; in grep mode, omit to search both.
  - `count` (optional): Number of entries to return (tail default: 10, grep default: 50)
  - `ignoreCase` (optional): Case-insensitive matching (default: false)
- `allowed-process` Manage the process-creation allow list (the allow-x gate)
  - `action` (required): `allow` | `delete` | `list`
  - `script` (required for allow/delete): The script/command
  - `args` (optional): Array of arguments
  - `cwd` (optional): Working directory (default: current working directory)
- `procm-command` Manage processes defined in `procm-commands.json` (still subject to allow-x)
  - `action` (required): `list` | `start`
  - `name` (required for start): The command name as defined in the file
  - `cwd` (optional): Project directory containing `procm-commands.json` (default: current working directory)

## License

MIT
