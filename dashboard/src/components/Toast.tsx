import { useEffect } from "react";

interface ToastProps {
  message: string;
  isError?: boolean;
  onDismiss: () => void;
}

// Minimal transient toast. Not the coss toast primitive — kept inline to avoid
// pulling the heavier toastManager/provider wiring for a single message.
export function Toast({ message, isError, onDismiss }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 2800);
    return () => clearTimeout(t);
  }, [message, onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={
        "pointer-events-none fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-lg border bg-popover px-4 py-2.5 text-sm shadow-lg " +
        (isError ? "border-destructive/50 text-destructive-foreground" : "border-border text-popover-foreground")
      }
    >
      {message}
    </div>
  );
}
