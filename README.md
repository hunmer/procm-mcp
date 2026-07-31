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

The `get-procm-commands` tool returns the file's contents and the available command names. The `start-procm-command` tool starts one by name. Each command's `cwd` is resolved relative to the project directory (the directory containing `procm-commands.json`). Starting a command **still goes through the allow-x gate**, so you must allow the exact script/args/cwd first with `allow-start-process`.

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

LLMs will ask you to use `allow-start-process` tool to add specific process creation to the whitelist.

Once you allow a process creation, you don't have to confirming it anymore as long as the command and the working directory are the same.

I call it "allow-x pattern", which can balances security and usability in MCP.

**Warning: Do not permit LLMs to use `allow-start-process` without confirmation.That means "Do anything you want to".**

### Disabling the gate (`--allow-all`)

In trusted environments you can disable the gate entirely so `start-process` and `start-procm-command` run without pre-approval:

- CLI flag: `--allow-all`
- Env var: `PROCM_ALLOW_ALL=1` (also accepts `true`/`yes`/`on`)

When enabled, the server prints a `WARNING — allow-start-process gate is DISABLED` banner on startup. This flag only affects the **LLM/MCP** path (`start-process` / `start-procm-command`); the HTTP dashboard already starts processes without the gate since it is a human-driven UI.

> ⚠️ **Dangerous.** With `--allow-all`, an LLM can start any process without confirmation. Only use it in sandboxed, throwaway, or otherwise trusted environments — never expose it to untrusted clients or networks.

## Tools

- `allow-start-process` Allow specific processes to be created
  - `script` (required): The script/command to allow
  - `args` (optional): Array of arguments
  - `cwd` (optional): Working directory
- `start-process` Start a new process with specified script and arguments
  - `script` (required): The script/command to execute
  - `name` (optional): A friendly name for the process
  - `args` (optional): Array of arguments to pass to the script
  - `cwd` (required): Working directory for the process
  - `envs` (optional): Environment variables to set for the process
- `delete-process` Stop and remove a process by ID.The default signal is SIGTERM, but SIGKILL(force killing) will be sent after 10 seconds unless the process exits.
  - `id` (required): The process ID
- `restart-process` Restart an existing process by ID
  - `id` (required): The process ID
- `get-process-info` Get detailed information about a process
  - `id` (required): The process ID
- `list-processes` List all currently managed processes
  - No parameters required
- `get-process-stdout` Retrieve stdout logs from a process
  - `id` (required): The process ID
  - `chunkCount` (optional): Number of recent log entries to retrieve (default: 10)
- `get-process-stderr` Retrieve stderr logs from a process
  - `id` (required): The process ID
  - `chunkCount` (optional): Number of recent log entries to retrieve (default: 10)
- `grep-process-logs` Search a single process's stdout/stderr logs with a regular expression (results newest-first)
  - `id` (required): The process ID
  - `pattern` (required): A regular expression to match against log messages
  - `stream` (optional): `"stdout"` or `"stderr"`; omit to search both
  - `ignoreCase` (optional): Case-insensitive matching (default: false)
  - `count` (optional): Maximum number of matches to return (default: 50)
- `get-procm-commands` Read `procm-commands.json` from a project directory
  - `cwd` (optional): Project directory (default: current working directory)
- `start-procm-command` Start a process defined in `procm-commands.json` by name (still subject to allow-x)
  - `name` (required): The command name as defined in the file
  - `cwd` (optional): Project directory containing `procm-commands.json` (default: current working directory)

## License

MIT
