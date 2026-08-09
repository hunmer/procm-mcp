import { useEffect, useRef } from "react";

interface ToastProps {
  message: string;
  isError?: boolean;
  onDismiss: () => void;
}

// Minimal transient toast. Not the coss toast primitive — kept inline to avoid
// pulling the heavier toastManager/provider wiring for a single message.
export function Toast({ message, isError, onDismiss }: ToastProps) {
  // The auto-close timer must fire once on mount and survive parent re-renders.
  // App re-renders every second (for its uptime clock), which would otherwise
  // pass a fresh inline onDismiss each time, flip this effect's deps, and keep
  // resetting the 2800ms timer so it never fires — the toast would stick.
  // Holding the latest callback in a ref decouples the timer from that churn.
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    const t = setTimeout(() => onDismissRef.current(), 2800);
    return () => clearTimeout(t);
  }, []);

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
