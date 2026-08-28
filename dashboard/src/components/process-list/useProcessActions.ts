import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  deleteProcessCall,
  getProcessCommand,
  restartProcess,
  stopProcess,
} from "@/lib/api";
import type { ProcessView } from "@/lib/types";
import { canStopProcess } from "./utils";

export interface UseProcessActionsResult {
  pendingDelete: ProcessView | null;
  pendingStop: ProcessView | null;
  requestDelete: (p: ProcessView) => void;
  requestStop: (p: ProcessView) => void;
  confirmDelete: () => Promise<void>;
  confirmStop: () => Promise<void>;
  handleCopyId: (p: ProcessView) => Promise<void>;
  handleCopyCommand: (p: ProcessView) => Promise<void>;
  handleRestart: (id: string) => Promise<void>;
  dismissDelete: () => void;
  dismissStop: () => void;
}

// Owns the delete/stop confirmation state and every process mutation (delete,
// stop, restart, copy id/command). Each handler toasts on success/failure and
// relies on the backend's WebSocket push to refresh the list. Deleting a running
// process needs confirmation (it's stopped first, then erased); already-stopped
// records are deleted immediately without a dialog.
export function useProcessActions(
  onToast: (message: string, isError?: boolean) => void,
): UseProcessActionsResult {
  const { t } = useTranslation();
  // Process awaiting delete confirmation in the alert dialog.
  const [pendingDelete, setPendingDelete] = useState<ProcessView | null>(null);
  // Process awaiting stop confirmation in the alert dialog.
  const [pendingStop, setPendingStop] = useState<ProcessView | null>(null);

  // Actually delete (stops first if running, then erases the record). The
  // backend emits a process-change event so the list refreshes over WS.
  async function doDelete(p: ProcessView) {
    try {
      await deleteProcessCall(p.id);
      onToast(t("processes.toastDeleted", { name: p.name }));
    } catch (err) {
      onToast(err instanceof Error ? err.message : String(err), true);
    }
  }

  function requestDelete(p: ProcessView) {
    if (canStopProcess(p)) {
      setPendingDelete(p);
    } else {
      void doDelete(p);
    }
  }

  // Confirmed from the alert dialog (running processes only).
  async function confirmDelete() {
    const p = pendingDelete;
    if (!p) return;
    setPendingDelete(null);
    await doDelete(p);
  }

  // Open the alert dialog to confirm stopping a process. Only running/spawning
  // processes can be stopped; the caller (row button / context menu) is
  // responsible for gating on `canStop`, but we double-check defensively.
  function requestStop(p: ProcessView) {
    if (!canStopProcess(p)) return;
    setPendingStop(p);
  }

  // Actually stop the process (keeps its record as history).
  async function confirmStop() {
    const p = pendingStop;
    if (!p) return;
    setPendingStop(null);
    try {
      await stopProcess(p.id);
      onToast(t("processes.toastStopped", { name: p.name }));
    } catch (err) {
      onToast(err instanceof Error ? err.message : String(err), true);
    }
  }

  async function handleCopyId(p: ProcessView) {
    try {
      await navigator.clipboard.writeText(p.id);
      onToast(t("processes.toastCopiedId", { id: p.id }));
    } catch {
      onToast(t("processes.toastCopyFailed"), true);
    }
  }

  // Copy a complete, paste-and-run terminal command for the process. Built on
  // the backend (cd to cwd + env-var prefixes + `script args`), formatted for
  // the backend's own OS. Works for any process that has ever run: live
  // processes and persisted records both include env-var prefixes; records
  // written before envs were persisted fall back to script+args+cwd only.
  async function handleCopyCommand(p: ProcessView) {
    try {
      const { command } = await getProcessCommand(p.id);
      await navigator.clipboard.writeText(command);
      onToast(t("processes.toastCopiedCommand"));
    } catch (err) {
      onToast(err instanceof Error ? err.message : String(err), true);
    }
  }

  async function handleRestart(id: string) {
    try {
      await restartProcess(id);
      onToast(t("processes.toastRestarted", { id }));
      // Same as delete: the WebSocket push handles the list refresh.
    } catch (err) {
      onToast(err instanceof Error ? err.message : String(err), true);
    }
  }

  return {
    pendingDelete,
    pendingStop,
    requestDelete,
    requestStop,
    confirmDelete,
    confirmStop,
    handleCopyId,
    handleCopyCommand,
    handleRestart,
    dismissDelete: () => setPendingDelete(null),
    dismissStop: () => setPendingStop(null),
  };
}
