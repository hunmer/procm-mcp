# Plan: LogPanel footer — copy-text button + dropdown (copy path / download file)

## Goal
In `dashboard/src/components/LogPanel.tsx`, add to the footer toolbar:
1. A **copy icon button** (left group) that copies the currently displayed log text to the clipboard.
2. A **dots (overflow) icon button** (right group, next to the line-count text) that opens a dropdown menu with:
   - **复制日志文件位置** (Copy log file location)
   - **下载日志文件** (Download log file)

Because the browser can't know `os.tmpdir()` or read the on-disk `.log` files, add two backend endpoints (user chose "Backend endpoints").

---

## 1. Backend — expose file paths + serve the log file

### `src/process-stdout-client.ts`
- Add `textFilePath: string` to the `ProcessStdoutClient` type and return it from `createProcessStdoutClient` (it's already a local `const`, just expose it). Non-breaking addition.

### `src/http-server.ts`
Extend the route regex to accept two new actions and add handlers. New regex:
```
/^\/api\/processes(?:\/([^/]+))?(?:\/(stop|restart|logs|log-files|log-download))?$/
```
- **`GET /api/processes/:id/log-files`** → `200 { stdoutPath, stderrPath }`. Reads `meta.stdoutClient.textFilePath` / `stderrClient.textFilePath`. 404 if process not found. Returns absolute paths so the frontend can copy the real location.
- **`GET /api/processes/:id/log-download`** → streams the merged `.log` file as an attachment. Implementation:
  - Build the merged text by reading both `meta.stdoutClient.textFilePath` and `stderrClient.textFilePath` with `fs/promises.readFile`. If a file is missing, treat as empty (catch ENOENT). Mirror the frontend's merge: parse each line's leading `[ISO]` timestamp and stable-sort by time, so the downloaded file matches what the dashboard shows. Reuse the existing `[ISO] message` line format.
  - `Content-Disposition: attachment; filename="<name>-<id>.log"` (sanitize `name`), `Content-Type: text/plain; charset=utf-8`.
  - This stays inside the `if (idParam)` block alongside the existing `logs`/`stop`/`restart` action handlers, reusing `getProcess` / `json` / `toErrorMessage`.

> Streaming the actual `.log` file (vs re-querying the lowdb JSON) gives the user the true file, not a count-capped reconstruction.

---

## 2. Frontend — API client

### `dashboard/src/lib/api.ts`
Add two thin wrappers (reuse the existing `api<T>` helper):
- `getLogFiles(id): Promise<{ stdoutPath: string; stderrPath: string }>` → `GET /api/processes/:id/log-files`
- `downloadLogUrl(id, name): string` → builds the `/api/processes/:id/log-download` URL string. The caller sets it as an `<a download>` href (browser-native download, no body parsing needed). Note: if `PROCM_HTTP_TOKEN` is in use, append `?token=` from the same source `ws.ts` reads — but REST fetch in this codebase doesn't currently pass a token, so match existing behavior (no token query) to stay consistent. *(Will double-check `ws.ts` token source during implementation; if trivial to reuse, include it.)*

---

## 3. Frontend — new `menu.tsx` primitive

There's no dropdown/Menu primitive in `dashboard/src/registry/default/ui/` (only `context-menu.tsx`). Base UI ships `@base-ui/react/menu`. Following the existing `context-menu.tsx` pattern, create:

### `dashboard/src/registry/default/ui/menu.tsx`
A styled thin wrapper around Base UI's `Menu` namespace, mirroring `context-menu.tsx`:
- `Menu = MenuPrimitive.Root`
- `MenuTrigger` (data-slot `menu-trigger`)
- `MenuPopup` — auto-wrapped in `Menu.Portal` + `Menu.Positioner` (Base UI requires `Popup` inside a `Positioner`), styled identically to `context-menu-popup` (`bg-popover text-popover-foreground ... rounded-lg border p-1 shadow-md` + the same start/end-style transitions).
- `MenuItem` — styled like `context-menu-item`, supports `variant?: "default" | "destructive"`, supports leading icons (`[&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0`). Base UI menu items close on click by default (no extra prop needed).
- `MenuSeparator` (optional, include for parity; the dropdown has 2 items so a separator isn't required, but it's cheap and keeps parity with `context-menu.tsx`).

Imports: `import { Menu as MenuPrimitive } from "@base-ui/react/menu"`. Uses `cn` from `@/registry/default/lib/utils`.

---

## 4. Frontend — `LogPanel.tsx` changes

### New imports
- `CopyIcon` (already imported), `MoreVerticalIcon` (dots) / `EllipsisVerticalIcon`, `FolderTreeIcon` or `FileIcon` (for "copy location"), `DownloadIcon` — from `lucide-react`.
- `Menu`, `MenuItem`, `MenuPopup`, `MenuTrigger` from `@/registry/default/ui/menu`.
- `getLogFiles`, `downloadLogUrl` from `@/lib/api`.

### New handlers
- `handleCopyText()` — builds the displayed log text from `entries` (reuse the same line rendering: optional line number is `select-none` so it's excluded; include `[time]` and `[stderr]` prefixes to match the visible view via `formatTime`), then `navigator.clipboard.writeText(...)`, toast `Copied ${n} lines` / `Copy failed`. Edge case: empty entries → toast `Nothing to copy` and skip.
- `handleCopyLocation()` — `await getLogFiles(process.id)`, write both paths joined by `\n` (or just stdout if you prefer single-line — will include both, clearer for the user) to clipboard, toast `Copied log file path`. On error, toast the error.
- `handleDownloadLog()` — create a temporary `<a>`, `href = downloadLogUrl(process.id, process.name)`, set `download = \`${process.name}-${process.id}.log\``, append to body, `.click()`, then remove. (Browser-native download.) Optional toast on success.

### Footer markup (replace the existing footer block, lines ~391–425)
Keep the existing **left** group (time toggle, line-numbers toggle) **and add** the copy-text button to it (so order is: clock, line-numbers, copy-text). Reorganize so the count text and the dots button are both on the **right**:

```
[ClockIcon] [ListOrderedIcon] [CopyIcon]            N lines  [EllipsisVertical → dropdown]
└── left group ──┘                                  └── right group ─────────────┘
```

- Copy button: `Button size="icon-sm" variant="ghost"`, `aria-label="Copy logs"`, `title="Copy logs"`, `onClick={handleCopyText}`, child `<CopyIcon />`. (Mirrors the existing footer toggle buttons.)
- Dots button via `Menu`:
  ```tsx
  <Menu>
    <MenuTrigger
      render={
        <Button size="icon-sm" variant="ghost"
          aria-label="More actions" title="More actions" />
      }
    >
      <EllipsisVerticalIcon />
    </MenuTrigger>
    <MenuPopup>
      <MenuItem onClick={handleCopyLocation}>
        <FolderTreeIcon aria-hidden="true" /> 复制日志文件位置
      </MenuItem>
      <MenuItem onClick={handleDownloadLog}>
        <DownloadIcon aria-hidden="true" /> 下载日志文件
      </MenuItem>
    </MenuPopup>
  </Menu>
  ```
  - Using `render={<Button …/>}` follows the coss Menu pattern (`MenuTrigger render={<Button …/>}`). The button styling then comes from `buttonVariants` exactly like the footer's other buttons.
  - Item labels are in Chinese per the request.

---

## 5. Verification
- `npm run build` from repo root (runs `build:dashboard` + `tsc`), confirm no TS/lint errors. Focus areas: `noUnusedLocals`/`noUnusedParameters` are on, so don't leave unused imports; Base UI `Menu.*` prop types must line up.
- Manual smoke check plan (documented, not necessarily run): open a process with logs → footer copy button copies text; dots → "复制日志文件位置" copies `<tmp>/procm-mcp/<serverId>(<pid>)/processes/<id>-stdout.log` + stderr; "下载日志文件" downloads `<name>-<id>.log` containing the merged chronologically-sorted log.

---

## Files touched
- `src/process-stdout-client.ts` (expose `textFilePath`)
- `src/http-server.ts` (2 new routes + regex)
- `dashboard/src/lib/api.ts` (2 wrappers)
- `dashboard/src/registry/default/ui/menu.tsx` (new primitive)
- `dashboard/src/components/LogPanel.tsx` (footer buttons + handlers)

No DB schema or WS protocol changes. Existing endpoints/behaviors unchanged (the new regex is a superset of the old one).