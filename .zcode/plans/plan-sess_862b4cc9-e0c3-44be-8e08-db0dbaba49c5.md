## Goal
In `LogPanel.tsx`:
1. **Move** the Clear-logs button (`EraserIcon`, currently header lines 422-430) down into the footer toolbar.
2. **Add** process start/stop/restart controls (mirroring `ProcessList.tsx` 414-448) to the footer toolbar, so the user can control the open process directly from its log panel.

Scope is **Restart/Stop/Run only** (no Delete). Stop requires a confirmation dialog (mirroring ProcessList). The Collapse button stays in the header.

---

## Changes

### 1. `dashboard/src/components/LogPanel.tsx`

**Imports** — add to existing import blocks:
- From `lucide-react`: `PlayIcon`, `RotateCwIcon`, `SquareIcon` (keep `EraserIcon` since it's reused in footer).
- Add `restartProcess, stopProcess` to the `@/lib/api` import.
- Add imports for `AlertDialog` family (`AlertDialog, AlertDialogClose, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogPopup, AlertDialogTitle`) from `@/registry/default/ui/alert-dialog`.

**Component state / handlers** (inside `LogPanel`):
- Add `const [pendingStop, setPendingStop] = useState(false);`
- Add `const canStop = process.stoppedAt == null && process.status !== "exited" && process.status !== "error";` (mirror ProcessList's gating).
- Add `handleRestart()` — calls `restartProcess(process.id)`, toasts `logs.toastRestarted` on success / error message on failure (mirror ProcessList `handleRestart`).
- Add `requestStop()` — guards on `!canStop`, then `setPendingStop(true)`.
- Add `confirmStop()` — calls `stopProcess(process.id)`, toasts `logs.toastStopped`, clears `pendingStop`.

**Header (lines 421-440)** — remove the Clear-logs `<Button>` block (422-430). The Collapse button remains the only header action. Collapse's left-side gap stays fine since it's the sole occupant.

**Footer toolbar (lines 565-648)** — insert the new controls into the **left** group (`flex items-center gap-1`), placing them right after the existing 4 view-toggle/copy buttons and before the Clear-logs button, with a `<Separator orientation="vertical" />` divider:
```
[Clock][Lines][AutoScroll][Copy]  |  [Restart][Stop-or-Play][Clear]
```
- Restart button: `RotateCwIcon`, `variant="ghost"`, `className="text-muted-foreground hover:text-success"`, aria/title `logs.restartTitle` / `logs.restartAria {name}`.
- If `canStop`: Stop button `SquareIcon`, `text-muted-foreground hover:text-warning`, calls `requestStop`.
- Else: Run/Play button `PlayIcon`, `text-muted-foreground hover:text-success`, calls `handleRestart`.
- Clear-logs button (`EraserIcon`) stays as it is now, just relocated to the footer (after the process controls).

**Stop confirmation** — add a new `<AlertDialog open={pendingStop} ...>` at the end of the `<aside>` (mirroring ProcessList's 754-780 structure): title `processes.stopQuestion`, description `logs.stopDescription {name,id}` (new key — see below), Cancel + Stop (destructive) buttons.

### 2. `dashboard/src/locales/zh.json` and `en.json`

Add to the `logs` object (keys reused by the new footer controls):
- `logs.restartTitle` — zh "重启" / en "Restart"
- `logs.restartAria` — zh "重启 {{name}}" / en "Restart {{name}}"
- `logs.stopTitle` — zh "停止（保留记录）" / en "Stop (keeps the record)"
- `logs.stopAria` — zh "停止 {{name}}" / en "Stop {{name}}"
- `logs.runTitle` — zh "运行" / en "Run"
- `logs.runAria` — zh "运行 {{name}}" / en "Run {{name}}"
- `logs.stopQuestion` — zh "要停止该进程吗？" / en "Stop process?"
- `logs.stopDescription` — zh "这将停止"{{name}}"（{{id}}）。其记录与日志将作为历史保留。" / en "This will stop "{{name}}" ({{id}}). Its record and logs are kept as history."
- `logs.toastStopped` — zh "已停止 {{name}}" / en "Stopped {{name}}"
- `logs.toastRestarted` — zh "已重启 {{id}}" / en "Restarted {{id}}"

(Stop dialog keys live under `logs` to keep all LogPanel copy co-located; the `processes.*` versions in ProcessList stay untouched.)

---

## Verification
- `cd dashboard && npm run build` (or `tsc --noEmit`) to confirm types compile.
- Manual spot-check: open a running process → footer shows Restart + Stop + Clear; open a stopped process → shows Restart(Play) + Clear; Stop triggers the confirmation dialog.