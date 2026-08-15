// HTTP API catalog for the playground tab. Mirrors the routes implemented in
// src/http-server.ts, grouped the way they're presented in the left rail.
// Excluded: `/` + `/assets/*` (static), `/mcp` (streaming MCP protocol) and
// `/api/processes/:id/log-download` (file attachment, not JSON).
// Group labels/descs render through i18n (`playground.groups.*`); endpoint
// labels/descs stay English — they mirror the API surface itself.

export type HttpMethod = "GET" | "POST" | "DELETE" | "PATCH";

export type PlayGroupId =
  | "server"
  | "processes"
  | "rooms"
  | "system"
  | "files"
  | "logs";

// How a field renders and serializes:
//   text/number/array → Input (array = whitespace-separated string[])
//   textarea/lines/envs → Textarea (lines = one-per-line string[]; envs =
//     KEY=VALUE-per-line Record<string,string>)
//   select/boolean → dropdown (boolean is tri-state: "" = omit)
export type PlayFieldType =
  | "text"
  | "number"
  | "textarea"
  | "select"
  | "boolean"
  | "array"
  | "lines"
  | "envs";

export interface PlayField {
  name: string;
  label: string;
  type: PlayFieldType;
  required?: boolean;
  placeholder?: string;
  help?: string;
  defaultValue?: string;
  options?: string[];
}

export interface PlayEndpoint {
  id: string;
  method: HttpMethod;
  // Path template with `:name` params replaced on submit.
  path: string;
  group: PlayGroupId;
  label: string;
  desc: string;
  pathParams: PlayField[];
  queryParams: PlayField[];
  bodyFields: PlayField[];
}

export const PLAY_GROUPS: { id: PlayGroupId }[] = [
  { id: "server" },
  { id: "processes" },
  { id: "rooms" },
  { id: "system" },
  { id: "files" },
  { id: "logs" },
];

const none = { pathParams: [], queryParams: [], bodyFields: [] };

export const PLAY_ENDPOINTS: PlayEndpoint[] = [
  {
    id: "meta",
    method: "GET",
    path: "/api/meta",
    group: "server",
    label: "Server metadata",
    desc: "Server id, pid, working directory and start time.",
    ...none,
  },
  {
    id: "processes.list",
    method: "GET",
    path: "/api/processes",
    group: "processes",
    label: "List processes",
    desc: "All processes (live + historical records).",
    ...none,
  },
  {
    id: "processes.start",
    method: "POST",
    path: "/api/processes",
    group: "processes",
    label: "Start process",
    desc: "Spawn a new process and begin capturing its output.",
    ...none,
    bodyFields: [
      {
        name: "script",
        label: "Script",
        type: "text",
        required: true,
        placeholder: "node",
      },
      {
        name: "cwd",
        label: "Working directory",
        type: "text",
        required: true,
        placeholder: "G:/my-project",
      },
      { name: "name", label: "Name", type: "text", placeholder: "my-server" },
      {
        name: "args",
        label: "Args",
        type: "array",
        placeholder: "server.js --port 3000",
        help: "Whitespace-separated arguments.",
      },
      {
        name: "envs",
        label: "Env vars",
        type: "envs",
        placeholder: "NODE_ENV=development",
        help: "One KEY=VALUE per line.",
      },
      { name: "desc", label: "Description", type: "text" },
      {
        name: "port",
        label: "Port",
        type: "number",
        placeholder: "3000",
        help: "TCP port the process serves on (1-65535).",
      },
      { name: "roomId", label: "Room ID", type: "text" },
    ],
  },
  {
    id: "processes.delete-bulk",
    method: "DELETE",
    path: "/api/processes",
    group: "processes",
    label: "Bulk delete",
    desc: "Stop + erase records in one server-side pass. Omit ids to target every record.",
    ...none,
    bodyFields: [
      {
        name: "ids",
        label: "Ids",
        type: "lines",
        help: "One process id per line. Empty = delete all.",
      },
    ],
  },
  {
    id: "processes.get",
    method: "GET",
    path: "/api/processes/:id",
    group: "processes",
    label: "Get process",
    desc: "Live view of a running process.",
    pathParams: [{ name: "id", label: "Process id", type: "text", required: true }],
    queryParams: [],
    bodyFields: [],
  },
  {
    id: "processes.delete",
    method: "DELETE",
    path: "/api/processes/:id",
    group: "processes",
    label: "Delete process",
    desc: "Stop (if running) and erase the persisted record.",
    pathParams: [{ name: "id", label: "Process id", type: "text", required: true }],
    queryParams: [],
    bodyFields: [],
  },
  {
    id: "processes.stop",
    method: "POST",
    path: "/api/processes/:id/stop",
    group: "processes",
    label: "Stop process",
    desc: "Terminate the process but keep its record.",
    pathParams: [{ name: "id", label: "Process id", type: "text", required: true }],
    queryParams: [],
    bodyFields: [],
  },
  {
    id: "processes.restart",
    method: "POST",
    path: "/api/processes/:id/restart",
    group: "processes",
    label: "Restart process",
    desc: "Stop then start again with the same launch recipe.",
    pathParams: [{ name: "id", label: "Process id", type: "text", required: true }],
    queryParams: [],
    bodyFields: [],
  },
  {
    id: "processes.input",
    method: "POST",
    path: "/api/processes/:id/input",
    group: "processes",
    label: "Send input",
    desc: "Write to stdin or deliver an OS signal (exactly one).",
    pathParams: [{ name: "id", label: "Process id", type: "text", required: true }],
    queryParams: [],
    bodyFields: [
      {
        name: "text",
        label: "Text",
        type: "textarea",
        placeholder: "hello",
        help: "Written to the process stdin.",
      },
      {
        name: "newline",
        label: "Newline",
        type: "boolean",
        help: "Append \\n after the text.",
      },
      {
        name: "signal",
        label: "Signal",
        type: "select",
        options: ["SIGINT", "SIGTERM", "SIGKILL"],
      },
    ],
  },
  {
    id: "processes.logs",
    method: "GET",
    path: "/api/processes/:id/logs",
    group: "processes",
    label: "Read logs",
    desc: "Tail recent output, or grep it with a regex.",
    pathParams: [{ name: "id", label: "Process id", type: "text", required: true }],
    queryParams: [
      {
        name: "stream",
        label: "Stream",
        type: "select",
        defaultValue: "stdout",
        options: ["stdout", "stderr"],
      },
      { name: "count", label: "Count", type: "number", defaultValue: "200" },
      { name: "grep", label: "Grep", type: "text", help: "Regex filter." },
      { name: "ignoreCase", label: "Ignore case", type: "boolean" },
      { name: "after", label: "After", type: "number", help: "Context lines after each match." },
    ],
    bodyFields: [],
  },
  {
    id: "processes.log-files",
    method: "GET",
    path: "/api/processes/:id/log-files",
    group: "processes",
    label: "Log file paths",
    desc: "Absolute on-disk stdout/stderr log paths.",
    pathParams: [{ name: "id", label: "Process id", type: "text", required: true }],
    queryParams: [],
    bodyFields: [],
  },
  {
    id: "processes.command",
    method: "GET",
    path: "/api/processes/:id/command",
    group: "processes",
    label: "Rebuild command",
    desc: "Paste-and-run shell command reproducing the spawn.",
    pathParams: [{ name: "id", label: "Process id", type: "text", required: true }],
    queryParams: [],
    bodyFields: [],
  },
  {
    id: "rooms.list",
    method: "GET",
    path: "/api/rooms",
    group: "rooms",
    label: "List rooms",
    desc: "Every process room with its active members.",
    ...none,
  },
  {
    id: "rooms.get",
    method: "GET",
    path: "/api/rooms/:roomId",
    group: "rooms",
    label: "Get room",
    desc: "Room metadata and current members.",
    pathParams: [{ name: "roomId", label: "Room id", type: "text", required: true }],
    queryParams: [],
    bodyFields: [],
  },
  {
    id: "rooms.update",
    method: "PATCH",
    path: "/api/rooms/:roomId",
    group: "rooms",
    label: "Update room",
    desc: "Patch the room's title and/or note.",
    pathParams: [{ name: "roomId", label: "Room id", type: "text", required: true }],
    queryParams: [],
    bodyFields: [
      { name: "title", label: "Title", type: "text" },
      { name: "note", label: "Note", type: "textarea" },
    ],
  },
  {
    id: "rooms.logs",
    method: "GET",
    path: "/api/rooms/:roomId/logs",
    group: "rooms",
    label: "Query room logs",
    desc: "Structured room log entries with filters.",
    pathParams: [{ name: "roomId", label: "Room id", type: "text", required: true }],
    queryParams: [
      { name: "memberPrefix", label: "Member prefix", type: "text" },
      {
        name: "level",
        label: "Level",
        type: "select",
        options: ["debug", "info", "warn", "error"],
      },
      { name: "traceId", label: "Trace id", type: "text" },
      { name: "count", label: "Count", type: "number" },
    ],
    bodyFields: [],
  },
  {
    id: "system.list",
    method: "GET",
    path: "/api/system-processes",
    group: "system",
    label: "List system processes",
    desc: "Every OS-level process with pid/ppid/command line.",
    ...none,
  },
  {
    id: "system.kill",
    method: "POST",
    path: "/api/system-processes/:pid/kill",
    group: "system",
    label: "Kill process tree",
    desc: "Terminate a pid and all its descendants. Protected pids are refused.",
    pathParams: [{ name: "pid", label: "PID", type: "number", required: true }],
    queryParams: [],
    bodyFields: [],
  },
  {
    id: "system.port",
    method: "GET",
    path: "/api/system-processes/port/:port",
    group: "system",
    label: "Find by port",
    desc: "Process(es) listening on a TCP port.",
    pathParams: [{ name: "port", label: "Port", type: "number", required: true }],
    queryParams: [],
    bodyFields: [],
  },
  {
    id: "favorites.scan",
    method: "POST",
    path: "/api/favorites/scan",
    group: "files",
    label: "Scan folder commands",
    desc: "Project-manifest scan returning candidate launch commands.",
    ...none,
    bodyFields: [
      {
        name: "path",
        label: "Folder path",
        type: "text",
        required: true,
        placeholder: "G:/my-project",
      },
    ],
  },
  {
    id: "files.open-folder",
    method: "POST",
    path: "/api/open-folder",
    group: "files",
    label: "Open folder",
    desc: "Reveal a folder in the OS file manager.",
    ...none,
    bodyFields: [
      { name: "path", label: "Folder path", type: "text", required: true },
    ],
  },
  {
    id: "files.reveal",
    method: "POST",
    path: "/api/reveal",
    group: "files",
    label: "Reveal path",
    desc: "Reveal a file (selected) or folder in the file manager.",
    ...none,
    bodyFields: [
      { name: "path", label: "Path", type: "text", required: true },
    ],
  },
  {
    id: "log-files.list",
    method: "GET",
    path: "/api/log-files",
    group: "logs",
    label: "List log files",
    desc: "Every on-disk process log file, newest-modified first.",
    ...none,
  },
  {
    id: "log-files.content",
    method: "GET",
    path: "/api/log-files/content",
    group: "logs",
    label: "Read log file",
    desc: "Full text of one log file, capped at 10MB server-side.",
    pathParams: [],
    queryParams: [
      {
        name: "path",
        label: "File path",
        type: "text",
        required: true,
        help: "Absolute path from “List log files”.",
      },
    ],
    bodyFields: [],
  },
];

// All input fields of an endpoint in one list (for schema building).
export function fieldsOf(ep: PlayEndpoint): PlayField[] {
  return [...ep.pathParams, ...ep.queryParams, ...ep.bodyFields];
}
