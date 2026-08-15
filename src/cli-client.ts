#!/usr/bin/env node
// CLI client: connect to a running procm-mcp --server backend over its HTTP API
// and run a command. Does NOT start a backend.
//
// Usage:
//   procm-mcp <command> [args] [--port <n>] [--token <t>]
//
// Commands:
//   ps                                    List running processes
//   info <id>                             Show details of a process
//   logs <id> [--stream stdout|stderr] [-n <count>]   Tail recent logs
//   grep <id> <pattern> [--stream s] [-n <count>] [--ignore-case|-i]
//   start <script> [args...] [--cwd <dir>] [--name <n>] [--group <n>] [--env KEY=VAL ...]
//   restart <id>                          Restart a process
//   stop <id>                             Stop and delete a process
//   ping                                  Check the backend is reachable
//   mcptool                               List MCP tools
//   mcptool <name>                        Show an MCP tool's schema
//   mcptool <name> [key=value ...] [--args <json>] [--raw]   Call an MCP tool
//
// Port: --port <n>, else PROCM_HTTP_PORT, else 7331.
// Token: --token <t> or PROCM_HTTP_TOKEN (sent as Bearer).

const DEFAULT_PORT = 7331;

type ProcView = {
  id: string;
  name: string;
  script: string;
  args: string[];
  cwd: string;
  status: string;
  pid: number | null;
  exitCode: number | null;
  error: string | null;
  group?: string | null;
};

function fail(msg: string, code = 1): never {
  console.error(`procm-mcp: ${msg}`);
  process.exit(code);
}

// Parse global flags out of argv, returning the rest. --data-path only affects
// backend mode, but strip it here so it is never forwarded to a started script.
function splitFlags(argv: string[]): { rest: string[]; port: number | undefined; token?: string } {
  let port: number | undefined;
  let token: string | undefined;
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--port") {
      port = Number(argv[++i]);
    } else if (a.startsWith("--port=")) {
      port = Number(a.slice("--port=".length));
    } else if (a === "--token") {
      token = argv[++i];
    } else if (a.startsWith("--token=")) {
      token = a.slice("--token=".length);
    } else if (a === "--data-path") {
      i++;
    } else if (a.startsWith("--data-path=")) {
      // Backend-only flag; ignored in client mode.
    } else {
      rest.push(a);
    }
  }
  return { rest, port, token };
}

function resolvePort(port: number | undefined): number {
  const p =
    port ?? (process.env.PROCM_HTTP_PORT ? Number(process.env.PROCM_HTTP_PORT) : DEFAULT_PORT);
  if (!Number.isInteger(p) || p <= 0 || p > 65535) {
    fail(`invalid port "${p}"`);
  }
  return p;
}

function resolveToken(token?: string): string | undefined {
  return token ?? process.env.PROCM_HTTP_TOKEN;
}

function base(port: number) {
  return `http://127.0.0.1:${port}`;
}

async function request(
  port: number,
  method: string,
  path: string,
  body?: unknown,
  token?: string,
): Promise<any> {
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  let res: Response;
  try {
    res = await fetch(base(port) + path, init);
  } catch (e: any) {
    if (e?.code === "ECONNREFUSED" || /fetch failed/i.test(e?.message || "")) {
      fail(`cannot connect to backend at ${base(port)}. Is "procm-mcp --server" running? (use --port to pick another)`);
    }
    throw e;
  }
  const text = await res.text();
  let data: any = text;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* keep text */
  }
  if (!res.ok) {
    const msg = data?.error || `HTTP ${res.status}`;
    fail(`${msg}`);
  }
  return data;
}

// ---- output formatters ----

function fmtPs(data: { serverId: string; pid: number; processes: ProcView[] }) {
  const procs = data.processes || [];
  if (procs.length === 0) {
    console.log("No processes are currently running.");
    return;
  }
  const rows = procs.map((p) => ({
    id: p.id,
    name: p.name,
    command: `${p.script}${p.args.length ? " " + p.args.join(" ") : ""}`,
    status: p.status,
    pid: p.pid ?? "-",
  }));
  const idW = Math.max(2, ...rows.map((r) => r.id.length));
  const nameW = Math.max(4, ...rows.map((r) => r.name.length));
  const stW = Math.max(6, ...rows.map((r) => r.status.length));
  console.log(
    `${"ID".padEnd(idW)}  ${"NAME".padEnd(nameW)}  ${"STATUS".padEnd(stW)}  PID     COMMAND`,
  );
  for (const r of rows) {
    console.log(
      `${r.id.padEnd(idW)}  ${r.name.padEnd(nameW)}  ${r.status.padEnd(stW)}  ${String(r.pid).padEnd(7)} ${r.command}`,
    );
  }
  console.log(`\n(${procs.length} process(es) · backend pid ${data.pid}, server ${data.serverId})`);
}

function fmtInfo(p: ProcView) {
  console.log(
    [
      `ID:       ${p.id}`,
      `PID:      ${p.pid ?? "-"}`,
      `Name:     ${p.name}`,
      `Script:   ${p.script}`,
      `Args:     ${p.args.join(" ")}`,
      `CWD:      ${p.cwd}`,
      `Status:   ${p.status}`,
      `Exit:     ${p.exitCode ?? "N/A"}`,
      `Error:    ${p.error ?? "N/A"}`,
    ].join("\n"),
  );
}

// ---- command handlers ----

async function cmdPs(port: number, token?: string) {
  fmtPs(await request(port, "GET", "/api/processes", undefined, token));
}

async function cmdInfo(port: number, args: string[], token?: string) {
  const id = args[0];
  if (!id) fail("usage: procm-mcp info <id>");
  fmtInfo(await request(port, "GET", `/api/processes/${encodeURIComponent(id)}`, undefined, token));
}

async function cmdLogs(port: number, args: string[], token?: string) {
  const id = args[0];
  if (!id) fail("usage: procm-mcp logs <id> [--stream stdout|stderr] [-n <count>]");
  let stream = "stdout";
  let count = 200;
  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (a === "--stream") stream = args[++i] || stream;
    else if (a === "-n" || a === "--count") count = Number(args[++i]);
  }
  const data = await request(
    port,
    "GET",
    `/api/processes/${encodeURIComponent(id)}/logs?stream=${stream}&count=${count}`,
    undefined,
    token,
  );
  console.log(data.text || `(no ${data.stream} output)`);
}

async function cmdGrep(port: number, args: string[], token?: string) {
  const id = args[0];
  const pattern = args[1];
  if (!id || !pattern) {
    fail("usage: procm-mcp grep <id> <pattern> [--stream s] [-n <count>] [-i|--ignore-case]");
  }
  let stream = "stdout";
  let count = 50;
  let ignoreCase = false;
  for (let i = 2; i < args.length; i++) {
    const a = args[i];
    if (a === "--stream") stream = args[++i] || stream;
    else if (a === "-n" || a === "--count") count = Number(args[++i]);
    else if (a === "-i" || a === "--ignore-case") ignoreCase = true;
  }
  const q = new URLSearchParams({
    stream,
    count: String(count),
    ignoreCase: ignoreCase ? "1" : "0",
  });
  const data = await request(
    port,
    "GET",
    `/api/processes/${encodeURIComponent(id)}/logs?grep=${encodeURIComponent(pattern)}&` + q,
    undefined,
    token,
  );
  console.log(data.text || `(no matches for /${pattern}/ in ${data.stream})`);
}

async function cmdStart(port: number, args: string[], token?: string) {
  // procm-mcp start <script> [args...] [--cwd dir] [--name n] [--group g] [--env K=V ...]
  if (args.length === 0) {
    fail("usage: procm-mcp start <script> [args...] [--cwd <dir>] [--name <n>] [--group <n>] [--env KEY=VAL ...]");
  }
  const passthrough: string[] = [];
  let cwd = process.cwd();
  let name: string | undefined;
  let group: string | undefined;
  const envs: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--cwd") cwd = args[++i];
    else if (a.startsWith("--cwd=")) cwd = a.slice("--cwd=".length);
    else if (a === "--name") name = args[++i];
    else if (a.startsWith("--name=")) name = a.slice("--name=".length);
    else if (a === "--group") group = args[++i];
    else if (a.startsWith("--group=")) group = a.slice("--group=".length);
    else if (a === "--env") {
      const kv = args[++i] || "";
      const eq = kv.indexOf("=");
      if (eq === -1) fail(`invalid --env "${kv}" (expected KEY=VAL)`);
      envs[kv.slice(0, eq)] = kv.slice(eq + 1);
    } else {
      passthrough.push(a);
    }
  }
  const script = passthrough[0];
  const scriptArgs = passthrough.slice(1);
  if (!script) fail("no script given to start");
  const data = await request(
    port,
    "POST",
    "/api/processes",
    { script, args: scriptArgs, cwd, name, group, envs },
    token,
  );
  console.log(`Process started: ${data.name} (ID: ${data.id})`);
}

async function cmdRestart(port: number, args: string[], token?: string) {
  const id = args[0];
  if (!id) fail("usage: procm-mcp restart <id>");
  await request(port, "POST", `/api/processes/${encodeURIComponent(id)}/restart`, {}, token);
  console.log(`Process ${id} restarted.`);
}

async function cmdStop(port: number, args: string[], token?: string) {
  const id = args[0];
  if (!id) fail("usage: procm-mcp stop <id>");
  await request(port, "DELETE", `/api/processes/${encodeURIComponent(id)}`, undefined, token);
  console.log(`Process ${id} stopped and deleted.`);
}

async function cmdPing(port: number, token?: string) {
  const data = await request(port, "GET", "/api/processes", undefined, token);
  console.log(`backend reachable: pid ${data.pid}, server ${data.serverId}, ${base(port)}`);
}

// ---- MCP tools over /mcp (stateless Streamable HTTP) ----

function tryJson(text: string): any {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

// POST one JSON-RPC message to /mcp and return the response message with a
// matching id. The transport answers either application/json or an SSE body
// (data: lines); both are handled. `notify` sends a notification (no id, no
// response expected). JSON-RPC / HTTP errors exit via fail().
async function mcpRpc(
  port: number,
  token: string | undefined,
  id: number | string | null,
  method: string,
  params: unknown,
): Promise<any | undefined> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    "MCP-Protocol-Version": "2025-06-18",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const notify = id === null;
  const body = JSON.stringify(
    notify ? { jsonrpc: "2.0", method } : { jsonrpc: "2.0", id, method, params },
  );
  let res: Response;
  try {
    res = await fetch(base(port) + "/mcp", { method: "POST", headers, body });
  } catch (e: any) {
    if (e?.code === "ECONNREFUSED" || /fetch failed/i.test(e?.message || "")) {
      fail(`cannot connect to backend at ${base(port)}. Is "procm-mcp --server" running? (use --port to pick another)`);
    }
    throw e;
  }
  const text = await res.text();
  const messages: any[] = [];
  const whole = tryJson(text);
  if (whole !== undefined) messages.push(whole);
  for (const line of text.split("\n")) {
    if (line.startsWith("data:")) {
      const m = tryJson(line.slice(5).trim());
      if (m !== undefined) messages.push(m);
    }
  }
  const msg = messages.find((m) => m && m.id === id) ?? messages[0];
  if (!res.ok) {
    fail(msg?.error?.message || `HTTP ${res.status} from /mcp`);
  }
  if (msg?.error) {
    fail(`MCP error ${msg.error.code}: ${msg.error.message}`);
  }
  return msg;
}

// One-time initialize handshake so the server accepts tool requests.
async function mcpHandshake(port: number, token?: string) {
  await mcpRpc(port, token, "cli-init", "initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "procm-mcp-cli", version: "1.0.0" },
  });
  await mcpRpc(port, token, null, "notifications/initialized", undefined);
}

// Coerce a key=value token's value: true/false and numbers keep their type,
// anything else that parses as JSON (arrays/objects/null) is kept, the rest
// stays a string.
function coerceValue(raw: string): unknown {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw.trim() !== "" && !Number.isNaN(Number(raw))) return Number(raw);
  const json = tryJson(raw);
  return json === undefined ? raw : json;
}

async function cmdMcpTool(port: number, args: string[], token?: string) {
  const toolArgsAll = args.slice(1);
  // --raw: print raw JSON instead of the formatted table / text output.
  const raw = toolArgsAll.includes("--raw");
  const toolArgs = toolArgsAll.filter((a) => a !== "--raw");
  const name = args[0];
  await mcpHandshake(port, token);

  // No tool name: list every tool with a one-line description.
  if (!name) {
    const r = await mcpRpc(port, token, 1, "tools/list", {});
    const tools: any[] = r?.result?.tools || [];
    if (raw) {
      console.log(JSON.stringify(tools, null, 2));
      return;
    }
    if (tools.length === 0) {
      console.log("(no MCP tools)");
      return;
    }
    const nameW = Math.max(4, ...tools.map((t) => t.name.length));
    console.log(`${"TOOL".padEnd(nameW)}  DESCRIPTION`);
    for (const t of tools) {
      const desc = String(t.description || "")
        .split("\n")
        .find((l: string) => l.trim()) || "(no description)";
      console.log(`${t.name.padEnd(nameW)}  ${desc.trim()}`);
    }
    console.log(`\n(${tools.length} tool(s) · call with: procm-mcp mcptool <name> key=value ...`);
    return;
  }

  // Tool name without arguments: show its description + input schema.
  if (toolArgs.length === 0) {
    const r = await mcpRpc(port, token, 2, "tools/list", {});
    const tool = (r?.result?.tools || []).find((t: any) => t.name === name);
    if (!tool) fail(`unknown tool "${name}" (run "procm-mcp mcptool" to list tools)`);
    if (raw) {
      console.log(JSON.stringify(tool, null, 2));
      return;
    }
    console.log(String(tool.description || "(no description)").trim());
    console.log("\nInput schema:");
    console.log(JSON.stringify(tool.inputSchema ?? {}, null, 2));
    return;
  }

  // Call the tool. Parameters come from --args '<json>' (must be a JSON
  // object) and/or key=value tokens (value coerced, see coerceValue);
  // key=value entries override --args on conflict.
  const input: Record<string, unknown> = {};
  for (let i = 0; i < toolArgs.length; i++) {
    const a = toolArgs[i];
    if (a === "--args") {
      const raw = toolArgs[++i];
      const parsed = tryJson(raw || "");
      if (!raw || typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        fail(`invalid --args "${raw}" (expected a JSON object)`);
      }
      Object.assign(input, parsed);
    } else if (a.startsWith("--args=")) {
      const raw = a.slice("--args=".length);
      const parsed = tryJson(raw);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        fail(`invalid --args "${raw}" (expected a JSON object)`);
      }
      Object.assign(input, parsed);
    } else if (a.includes("=")) {
      const eq = a.indexOf("=");
      input[a.slice(0, eq)] = coerceValue(a.slice(eq + 1));
    } else {
      fail(`unexpected argument "${a}" (expected key=value or --args '<json>')`);
    }
  }

  const r = await mcpRpc(port, token, 3, "tools/call", { name, arguments: input });
  const result = r?.result ?? {};
  if (raw) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    const texts = (result.content || [])
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text);
    if (texts.length) {
      console.log(texts.join("\n"));
    } else if (result.structuredContent !== undefined) {
      console.log(JSON.stringify(result.structuredContent, null, 2));
    } else {
      console.log("(tool returned no content)");
    }
  }
  // Tool-level errors (isError) print their text but exit non-zero.
  if (result.isError) {
    process.exitCode = 1;
  }
}

const COMMANDS = ["ps", "info", "logs", "grep", "start", "restart", "stop", "ping", "mcptool"];

export function isClientCommand(arg: string | undefined): boolean {
  return !!arg && COMMANDS.includes(arg);
}

export function clientHelp(): string {
  return [
    "Usage: procm-mcp <command> [args] [--port <n>] [--token <t>]",
    "",
    "Client commands (connect to a running --server backend; default port 7331):",
    "  ps                                    List running processes",
    "  info <id>                             Show details of a process",
    "  logs <id> [--stream stdout|stderr] [-n <count>]   Tail recent logs",
    "  grep <id> <pattern> [--stream s] [-n <count>] [-i]   Search logs with a regex",
    "  start <script> [args...] [--cwd <dir>] [--name <n>] [--group <n>] [--env KEY=VAL ...]",
    "                                        Start a new process",
    "  restart <id>                          Restart a process",
    "  stop <id>                             Stop and delete a process",
    "  ping                                  Check the backend is reachable",
    "  mcptool                               List MCP tools",
    "  mcptool <name>                        Show an MCP tool's description + schema",
    "  mcptool <name> [key=value ...] [--args <json>] [--raw]   Call an MCP tool",
    "",
    "Flags: --port <n> (or PROCM_HTTP_PORT), --token <t> (or PROCM_HTTP_TOKEN)",
  ].join("\n");
}

export async function runClient(argv: string[]): Promise<void> {
  const { rest, port, token } = splitFlags(argv);
  const command = rest[0];
  const args = rest.slice(1);
  const p = resolvePort(port);
  const t = resolveToken(token);

  switch (command) {
    case "ps":
      return cmdPs(p, t);
    case "info":
      return cmdInfo(p, args, t);
    case "logs":
      return cmdLogs(p, args, t);
    case "grep":
      return cmdGrep(p, args, t);
    case "start":
      return cmdStart(p, args, t);
    case "restart":
      return cmdRestart(p, args, t);
    case "stop":
      return cmdStop(p, args, t);
    case "ping":
      return cmdPing(p, t);
    case "mcptool":
      return cmdMcpTool(p, args, t);
    default:
      console.error(clientHelp());
      fail(`unknown command "${command}"`);
  }
}
