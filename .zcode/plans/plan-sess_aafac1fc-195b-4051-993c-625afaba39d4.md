# Plan: 列表右键菜单增加「复制命令」

## Goal
In `dashboard/src/components/ProcessList.tsx`'s row context menu, add a **「复制命令」(Copy command)** item that copies a complete, paste-and-run terminal command to the clipboard. The command must include the `cd` to the working dir, the env-var prefixes, and `script args` — built **for the backend's own OS** so it runs when pasted into a matching shell (win32 → cmd.exe syntax; *nix → POSIX/bash syntax), per the user's choice.

Key constraint discovered: `envs` lives **only** in the in-memory `ProcessMetadata`, never serialized to the client (deliberately omitted from `ProcessView`/`ProcessRecord`). So the full command (with envs) must be **built on the backend**, where `meta.envs` is available, and returned as a ready-to-copy string.

---

## 1. Backend — shell-quoting + command builder + route

### `src/process-stdout-client.ts`? No — put helpers in `src/http-server.ts` (local to the route that uses them).

Add two small quoting helpers at module scope in `src/http-server.ts` (next to `mergeLogText`):
- `quoteWin(arg)` — for cmd.exe: wrap in double quotes, escape embedded `"` as `\"`? Actually cmd.exe uses `"` literally; safest portable approach for cmd is double-quoting the whole token and escaping internal `"` by doubling (`""`)? The robust, simple rule for cmd.exe: wrap token in `"..."` and replace any `"` with `\"` is NOT cmd-native. **Use the widely-correct heuristic:** wrap in double quotes, and replace `"` → `\"`. This matches how most tools emit cmd-safe argv. (Keep it simple; envs/args are operator-provided, not adversarial.)
- `quotePosix(arg)` — POSIX single-quote wrapping: wrap token in `'...'` and escape embedded `'` as `'\''` (the standard, robust POSIX rule). This is safe for all shell metacharacters.

Then `buildCommand({ script, args, envs, cwd, platform })`:
- `platform` = `process.platform` (captured once).
- **win32 (cmd.exe):**
  - `cd /d "<cwd>" &&`
  - for each env `KEY=VALUE`: `set "KEY=<value>" && ` (value inline, no extra quotes — `set "K=V"` already handles spaces/spaces in V).
  - `"<script>" "<arg1>" "<arg2>" …` (each token win-quoted).
- **other (POSIX/bash/zsh):**
  - `cd '<cwd>' &&`
  - envs as inline prefixes: `KEY='<value>' KEY2='<value2>' ` (value posix-quoted).
  - `'<script>' '<arg1>' '<arg2>' …` (each token posix-quoted).
- Skip the `cd … &&` part when `cwd` is empty.
- Join with single spaces → one line.

### Route — `src/http-server.ts`
- Extend the regex alternation: add `command`.
  `/^\/api\/processes(?:\/([^/]+))?(?:\/(stop|restart|logs|log-files|log-download|command))?$/`
- Add handler (mirror `log-files`):
  - `GET /api/processes/:id/command` → `200 { command }`.
  - `meta = getProcess(idParam)`; if missing → `404 { error: "Process not found" }`.
  - Build the command from `meta.script`, `meta.args`, `meta.envs`, `meta.cwd`, `process.platform`.
  - **Live-only note:** `getProcess` resolves live processes (envs in memory). Stopped/exited records (persisted) don't carry envs — for those, `getProcess` returns undefined and we 404. This matches "复制命令" being most meaningful for live processes; historical rows will show the item disabled/greyed (see frontend). Document this in a comment.

---

## 2. Frontend — API client

### `dashboard/src/lib/api.ts`
- Add `getProcessCommand(id): Promise<{ command: string }>` → `GET /api/processes/:id/command` (reuse `api<T>`).

---

## 3. Frontend — context menu item

### `dashboard/src/components/ProcessList.tsx`
- New lucide import: `SquareTerminalIcon` (verified to exist). `CopyIcon` already imported.
- New handler `handleCopyCommand(p: ProcessView)`:
  - `try { const { command } = await getProcessCommand(p.id); await navigator.clipboard.writeText(command); onToast("Copied command"); } catch { onToast(err message, true) }`
- Insert a new `ContextMenuItem` into the popup, right after **Copy ID** and before **View** (logical grouping — both copy actions together):
  ```tsx
  <ContextMenuItem onClick={() => handleCopyCommand(p)}>
    <SquareTerminalIcon aria-hidden="true" />
    复制命令
  </ContextMenuItem>
  ```
- Gating: the command is only available for **live** processes (envs live in memory; stopped/exited records 404 the backend). Gate `disabled` on the row's lifecycle: `disabled={p.stoppedAt != null || p.status === "exited" || p.status === "error"}` (same predicate used elsewhere in the file for `canStop`-style checks). Disabled items in Base UI context menu render greyed and non-clickable. This avoids a confusing click→error-toast on historical rows.

---

## 4. Verification
- `npm run build` from repo root (dashboard `tsc -b` + backend `tsc`); confirm no TS/lint errors. Watch: `noUnusedLocals`/`noUnusedParameters` are on — only add imports I use.
- Manual smoke (documented): right-click a running process → 复制命令 → paste into a terminal matching the backend OS → runs with the right cwd + envs. Right-click a stopped/exited process → item greyed.

---

## Files touched
- `src/http-server.ts` — regex + `command` route + `quoteWin`/`quotePosix`/`buildCommand` helpers.
- `dashboard/src/lib/api.ts` — `getProcessCommand`.
- `dashboard/src/components/ProcessList.tsx` — `SquareTerminalIcon` import, `handleCopyCommand`, context-menu item (gated on live).

No DB schema change, no WS protocol change. `envs` stays server-side only (not added to `ProcessView`/wire) — the backend emits the final string, which also keeps secrets out of the dashboard's process-list payload. The one behavioral nuance (historical rows can't reconstruct envs) is surfaced as a disabled menu item rather than an error.