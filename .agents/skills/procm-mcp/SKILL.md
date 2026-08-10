---
name: procm-mcp
description: How to use the procm-mcp MCP server to launch, control, inspect, and interact with local processes from an agent. Use whenever the user wants to start/stop/restart a local command as a managed background process, read its live stdout/stderr logs, grep them, send stdin input or a signal (e.g. Ctrl+C / SIGINT), or run named commands from a project's procm-commands.json. Covers the five tools (start-process, process, process-logs, process-input, procm-command), their argument shapes, and common workflows.
---

# procm-mcp

procm-mcp is a local process manager exposed as an MCP server. It lets an agent
spawn long-running commands (dev servers, build watchers, REPLs, scripts),
keep them alive in the background across the conversation, read their logs in
real time, send them input or signals, and start predefined commands by name.

A single backend tracks every process it started. Each process gets a stable
**id** (8-char nanoid); that id is the handle for all subsequent operations.

## What this skill is for

Use this skill to:

- Start a command as a managed background process and get an id back
- List running processes, inspect one, or restart / delete it
- Tail or grep a process's stdout/stderr
- Write to a process's stdin (answer a prompt, feed a CLI) or send a signal
  (Ctrl+C = `SIGINT`, graceful stop, hard kill)
- Run commands predefined in a project's `procm-commands.json` by name

## Tool set (5 tools)

All five tools live under `src/tools/` and are registered in `src/index.ts`.
Argument schemas are validated with zod; unknown/extra args are rejected.

### 1. `start-process` — spawn a new process

Starts a single command as a managed child process and returns its id.

| arg | type | required | notes |
|---|---|---|---|
| `script` | string | **yes** | Executable to run. **No spaces / no `=`** — split a compound command into `script` + `args`, and put env vars in `envs`. A violation returns a helpful message instead of spawning. |
| `cwd` | string | **yes** | Working directory (absolute or relative to the backend). |
| `name` | string | no | Human label shown in lists/dashboard. Defaults to `script + args`. |
| `args` | string[] | no | Argv after `script`. |
| `envs` | object | no | Extra env vars (`{ "KEY": "value" }`), merged on top of the backend's own env. Persisted so a stopped process can be fully reproduced on restart. |
| `desc` | string | no | Free-text description, persisted with the record. |

Returns `Process started: <name> (ID: <id>)`.

The id is the handle for everything else — capture it from the response.

### 2. `process` — manage / list (unified)

One tool, four actions selected by `action`:

| action | needs `id`? | what it does |
|---|---|---|
| `"list"` | no | List every currently-running process as `id: name (script args...)`. Empty → "No processes are currently running." |
| `"get"` | **yes** | Full detail of one process: pid, name, script, args, cwd, status, exit code, error. |
| `"restart"` | **yes** | Kill and re-spawn in place (keeps the id). Works on stopped/expired processes too — rebuilt from its persisted record (envs included). |
| `"delete"` | **yes** | Stop (if running) and remove from the live list. The historical record is kept so it still shows as expired. |

Status values: `spawning` → `running` → `exited` (or `error`).

### 3. `process-logs` — tail or grep logs

Read a process's captured output. Two modes, picked by whether `pattern` is set:

- **Tail** (no `pattern`): most recent chunks of one stream.
  - `stream` defaults to `"stdout"`; `count` defaults to `10`.
- **Grep** (`pattern` set): regex search over the logs.
  - `stream` optional (omit → search both stdout **and** stderr).
  - `count` defaults to `50`, results returned **newest-first**.
  - `ignoreCase` (`boolean`, default false) for `/pattern/i`.
  - Invalid regex → returns an error message (does not throw).

| arg | type | notes |
|---|---|---|
| `id` | string | required |
| `stream` | `"stdout"` \| `"stderr"` | optional |
| `pattern` | string (regex) | optional — presence selects grep mode |
| `count` | number | optional (tail: 10, grep: 50) |
| `ignoreCase` | boolean | optional, grep only |

Lines are returned as `[ISO timestamp] (stream) message`. Requires a live
process — logs of stopped/expited processes are read via the HTTP API / dashboard,
not this tool (the in-memory client is gone).

### 4. `process-input` — write stdin or send a signal

Send input to a running process. **Exactly one of `text` / `signal`** must be
provided; both or neither returns an error.

- **`text`** — write a string to the process's stdin.
  - `newline` (boolean, default **true**) appends `\n` so a single write reads
    as one complete line by the child.
  - Set `newline: false` to send raw bytes (e.g. ANSI/control sequences).
- **`signal`** — deliver an OS signal to the child's pid (cross-platform;
  Windows maps these to the platform equivalent).
  - Whitelist: `SIGINT`, `SIGTERM`, `SIGKILL`, `SIGHUP`, `SIGUSR1`, `SIGUSR2`,
    `SIGTSTP`, `SIGCONT`, `SIGQUIT`. Anything else is rejected.
  - **Ctrl+C = `SIGINT`** — this is the reliable way to interrupt a process,
    *not* writing `\x03` (the piped stdio has no TTY, so a raw Ctrl byte is
    usually ignored).

| arg | type | notes |
|---|---|---|
| `id` | string | required |
| `text` | string | text mode |
| `newline` | boolean | text mode only, default true |
| `signal` | enum (see list) | signal mode |

Returns `Wrote <n> byte(s) to stdin of process <id>.` or
`Sent signal <SIG> to process <id>.`.

Failure reasons surfaced as text: process not found, no writable stdin
(child closed it), or write/kill error.

### 5. `procm-command` — run predefined commands by name

Reads `procm-commands.json` from a project directory and lets the agent start
or list its entries by name. Good for "start the dev server" style tasks where
the launch recipe should live with the project, not in the agent's memory.

| arg | type | notes |
|---|---|---|
| `action` | `"list"` \| `"start"` | required |
| `name` | string | required for `start`; the command's key in the JSON |
| `cwd` | string | project dir containing `procm-commands.json`, defaults to backend cwd |

- `list` returns the full file plus per-command live status (`running` with
  id/pid, or `not running`) and the available names.
- `start` resolves the command's `cwd` relative to the project dir, applies its
  `envs`, and spawns it. The command's **key becomes the process name**, which
  is how `list` cross-references it against live processes.

`procm-commands.json` shape:

```json
{
  "commands": {
    "dev": {
      "script": "npm",
      "args": ["run", "dev"],
      "cwd": ".",
      "envs": { "NODE_ENV": "development" },
      "desc": "Vite dev server on :5173"
    },
    "worker": { "script": "node", "args": ["worker.js"] }
  }
}
```

## Common workflows

### Start a dev server and watch its logs

1. `start-process` with `script`/`args`/`cwd` → note the `ID`.
2. `process-logs { id, stream: "stdout", count: 50 }` to see startup output.
3. If it didn't come up, `process-logs { id, pattern: "error|EADDRINUSE" }`.

### Stop a hung process cleanly

1. `process { action: "list" }` to find the id.
2. Try a graceful interrupt first:
   `process-input { id, signal: "SIGINT" }` (= Ctrl+C).
3. If it doesn't exit, `process-input { id, signal: "SIGTERM" }`.
4. Last resort: `process-input { id, signal: "SIGKILL" }`, or
   `process { action: "delete", id }` to stop + remove the record.

### Answer an interactive prompt

A CLI asking `Continue? (y/n)` — answer without restarting it:

```
process-input { id, text: "y" }     # newline appended automatically
```

### Run a project-defined command

```
procm-command { action: "list", cwd: "/path/to/project" }
procm-command { action: "start", name: "dev", cwd: "/path/to/project" }
```

## Rules of thumb

- **Split compound commands.** `start-process.script` cannot contain spaces or
  `=`. `npm run dev` → `script: "npm", args: ["run", "dev"]`; `FOO=bar cmd`
  → `envs: { "FOO": "bar" }`.
- **Capture the id.** Every later call keys off it. The id is stable across
  restarts (`restart` keeps the id).
- **Ctrl+C is `SIGINT`, not a byte.** Piped stdio has no TTY, so writing `\x03`
  usually does nothing. Use `signal: "SIGINT"`.
- **`text` and `signal` are mutually exclusive** — passing both is a 400/error.
- **Stopped processes keep their history** — `delete` leaves an expired record;
  logs are still served via the HTTP API / dashboard.
- **Background ≠ fire-and-forget.** A started process keeps running and writing
  logs until explicitly stopped or the backend exits. `cleanup()` on backend
  shutdown kills them all.

## Source of truth

- Tool definitions (authoritative): `src/tools/process.ts`,
  `src/tools/process-logs.ts`, `src/tools/process-input.ts`,
  `src/tools/procm-commands.ts`.
- Process lifecycle / stdin / signals: `src/process-manager.ts`
  (`sendProcessInput`, `startProcess`, `restartProcess`, signal whitelist
  `ALLOWED_INPUT_SIGNALS`).
- Backend modes & registration: `src/index.ts`.
- HTTP API (mirrors the tools for the dashboard / REST clients):
  `src/http-server.ts` — `POST /api/processes/:id/input`, `/stop`, `/restart`,
  `GET /api/processes/:id/logs`, etc.

When a tool's behavior and this doc disagree, **the source is right** —
read the file above before trusting the prose here.
