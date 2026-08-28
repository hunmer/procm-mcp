# Plan: LogPanel — show launch command + fix "Process not found" for closed processes

## Goal (two parts)
1. **Show the launch command** in `LogPanel` as a top strip (info-alert style per `p-alert-4`), above the log lines.
2. **Fix the "error: Process not found"** when opening a closed/stopped/expired process: show a **「进程已经关闭」** notice instead of the raw 404 error, **but still show its log files** (tail + download + copy-path).

Per user choice: **full fix** — persist log file paths on `ProcessRecord` so the backend can serve logs for stopped/expired processes (even after restart, since `.log` files are absolute paths under tmpdir and survive).

---

## Part A — Backend: persist log paths + serve logs for closed processes

### A1. `src/processes-repository.ts` — extend `ProcessRecord`
Add three optional fields (backward-compatible: lowdb reads old records as-is, these are `undefined` on legacy entries):
```ts
// Absolute paths to the on-disk plain-text log files, captured at start time
// so logs stay viewable/downloadable after the process is stopped/expired
// (its in-memory clients are gone). Undefined on records written before this.
stdoutLogPath?: string | null;
stderrLogPath?: string | null;
```

### A2. `src/process-manager.ts` — populate paths at serialization
- `toRecord(meta)` is the single serialization choke point. Add:
  ```ts
  stdoutLogPath: meta.stdoutClient.textFilePath,
  stderrLogPath: meta.stderrClient.textFilePath,
  ```
  (Both clients exist by the time `toRecord` runs.)
- **Export a record-by-id accessor** so http-server can fall back for stopped processes:
  ```ts
  export async function getProcessRecord(id: string): Promise<ProcessRecord | undefined>
  ```
  Implemented via `ensureRepository()` + `repo.getById(id)` (need to also export `ensureRepository`, or implement inline). `listProcessRecords` already shows the pattern.

### A3. `src/http-server.ts` — fallback paths for the 3 log endpoints
Import `getProcessRecord`. For each of `logs`, `log-files`, `log-download`, change the `getProcess(idParam)` → 404 block to a **live-or-record** resolution. Create a small shared helper at the top of the action handling:
```ts
// Resolve a process: live in-memory metadata first (has clients + envs),
// else fall back to the persisted record (has on-disk log paths). Returns
// null only when neither exists (true 404).
type ResolvedProcess =
  | { kind: "live"; meta: ProcessMetadata }
  | { kind: "record"; record: ProcessRecord };
async function resolveProcess(id: string): Promise<ResolvedProcess | null> {
  const meta = getProcess(id);
  if (meta) return { kind: "live", meta };
  const record = await getProcessRecord(id);
  if (record) return { kind: "record", record };
  return null;
}
```
And a `logFilePathsOf(rp)` that returns `{ stdoutPath, stderrPath }` from either branch (`live` → `meta.stdoutClient.textFilePath`; `record` → `record.stdoutLogPath ?? null`).

Endpoint changes:
- **`/logs`** (`getMergedLogs` calls this): when `resolveProcess` is `record` (no in-memory client), **read the `.log` text files directly** with `readFile` (tolerate ENOENT) and return them. The text has no `[ISO]` timestamps, so return raw lines — frontend's `parseLogText` falls back to "now" timestamps, which is fine for a static historical view. Mirror the existing `[ISO] message` join is NOT possible here (no timestamps); instead return lines as `{ stream, text }` where text is the raw file content. **Detail:** `getMergedLogs` (frontend api.ts) expects `LogsResponse { stream, text }` per stream and runs `parseLogText`. For records we keep the same response shape: stream's `text` = raw file content (newline-joined). Since `parseLogText` handles lines without `[ISO]` (assigns Date.now()), this works. The only change: `/logs` for a record reads the file instead of calling `client.top()`.
- **`/log-files`**: return paths from `logFilePathsOf(rp)` for both kinds. For a record whose `stdoutLogPath` is `null` (legacy), return `null` → frontend handles gracefully.
- **`/log-download`**: read the two `.log` files via the resolved paths (works identically for both kinds since the live branch already reads files; the record branch just gets paths from the record instead of `meta.stdoutClient`).
- **`/command`**: leave as-is — envs are in-memory only, so records genuinely can't build the full command; it stays 404 for closed processes (frontend shows a `script args` fallback built from the public record, and the menu item is already gated).

When `resolveProcess` returns `null` (truly unknown id), keep the existing 404 — but the frontend will map "Process not found" specifically to the 「进程已经关闭」 notice (see Part B), so even a genuine 404 degrades gracefully.

> Note: `mergeLogText` parses `[ISO] message` lines; for record-sourced `.log` files (raw messages, no timestamps) the merge still works (unmatched lines keep relative order, ts falls back). Good enough.

---

## Part B — Frontend: command strip + closed-process notice

### B1. New primitive `dashboard/src/registry/default/ui/alert.tsx`
Build per `p-alert-4` + coss alert guide. `@base-ui/react` has no Alert primitive (it's pure markup), so this is a styled wrapper (no Base UI dependency). Variants map to existing color tokens (`info`/`success`/`warning`/`error`/`default`), mirroring `badge.tsx` variant tokens:
```tsx
export function Alert({ className, variant = "default", ...props })
export function AlertTitle({ className, ...props })   // font-semibold
export function AlertDescription({ className, ...props }) // text-sm muted
```
Style: a rounded bordered box with variant-tinted bg (e.g. `info` → `bg-info/8 border-info/20`), `gap-2 flex items-start p-3 text-sm`, `data-slot="alert"`.

### B2. `dashboard/src/lib/api.ts` — fetch the command
Already added `getProcessCommand(id)` in the prior task — reuse it. For closed processes it 404s; `LogPanel` will catch that and fall back to a local `script args [in cwd]` string built from `process.script/args/cwd` (public fields always present).

### B3. `dashboard/src/components/LogPanel.tsx`
- **New state:** `command: string | null` (the launch command), `commandLoading`, `closed: boolean` (process is stopped/expired → derived from `process.stoppedAt != null || status === "exited" || status === "error"`).
- **Load the command** in a `useEffect([process.id])` (alongside, not inside, the logs effect to keep them independent): call `getProcessCommand`; on success set it; on 404, if `closed`, fall back to a locally-built `createCommandDisplay(process)` (e.g. `[script, ...args].join(" ")` plus `(in cwd)`); on other error leave `command = null`.
- **Command strip:** render above the `ScrollArea` log body, below the header, only when `command` is set. Use `Alert variant="info"` with a terminal icon:
  ```tsx
  <Alert variant="info" className="...shrink-0 rounded-none border-x-0 border-t-0...">
    <SquareTerminalIcon />  {/* or TerminalIcon */}
    <div className="min-w-0">
      <AlertTitle>Command</AlertTitle>
      <AlertDescription className="font-mono break-all">{command}</AlertDescription>
    </div>
  </Alert>
  ```
  Compact: single line that wraps; `font-mono`.
- **Closed-process notice:** in the load effect, if `getMergedLogs` throws with `"Process not found"` (or any error while `closed` is true), set a dedicated state `closedNotice = true` instead of putting the message into `error`. Render an `Alert variant="warning"` in the body:
  ```tsx
  <Alert variant="warning">
    <PowerIcon />  {/* or CircleOffIcon */}
    <AlertTitle>进程已经关闭</AlertTitle>
    <AlertDescription>This process is no longer running. Showing its last saved logs.</AlertDescription>
  </Alert>
  ```
  placed **above** the (now possibly partial) log lines — i.e. the body becomes `closedNotice && <Alert/>` followed by the existing log `<pre>`. If the backend successfully returns logs for the record (Part A), the user still sees lines below the notice. If logs are genuinely gone (file missing → empty), the existing Empty state shows.
  - Keep the **footer** (copy/download/dots) fully functional for closed processes — `getLogFiles`/`downloadLogUrl` now work for records via Part A. If a record lacks paths (legacy), those actions toast a graceful "No log file available" instead of the raw error (catch in the existing `handleCopyLocation`/`handleDownloadLog`).
- **Avoid the generic `error:` pre block** for the not-found case: the check is `if (closed && /Process not found/.test(msg))` → `closedNotice`; else → existing `error` path (real errors still surface).

### B4. Icons
`SquareTerminalIcon` (already used elsewhere), `PowerIcon` or `CircleOffIcon` from lucide for the closed notice, `InfoIcon` if the strip uses default alert.

---

## Part C — Verification
- `npm run build` (dashboard `tsc -b` + backend `tsc`); zero errors. Watch `noUnusedLocals`/`noUnusedParameters`.
- Manual smoke (documented):
  1. Start a process → open logs → command strip shows; close panel fine.
  2. Stop a running process (explicit stop) → reopen its row in the list → opens LogPanel with **「进程已经关闭」** notice + still shows last logs + download/copy-path work.
  3. Restart backend → open a historical (stopped) record → notice + logs still served from persisted `.log` paths (provided the record was written with paths; legacy records show "No log file available").

---

## Files touched
**Backend:**
- `src/processes-repository.ts` — `ProcessRecord` += optional `stdoutLogPath`/`stderrLogPath`.
- `src/process-manager.ts` — `toRecord` populates paths; export `getProcessRecord` (+ `ensureRepository` if needed).
- `src/http-server.ts` — `resolveProcess` helper + fallback in `logs`/`log-files`/`log-download`; `command` unchanged.

**Frontend:**
- `dashboard/src/registry/default/ui/alert.tsx` — new Alert primitive.
- `dashboard/src/components/LogPanel.tsx` — command strip (info alert), closed-process notice (warning alert), graceful error mapping, keep footer actions working.

No WS schema change; the public `ProcessView` projection is unchanged (log paths stay server-side). New optional record fields are backward-compatible with existing `processes.json`.