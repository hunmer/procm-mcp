import { useEffect, useRef, useState } from "react";
import type {
  WsLogMessage,
  ProcessStream,
} from "./types";

export type WsStatus = "connecting" | "open" | "closed";

export interface UseDashboardSocket {
  status: WsStatus;
  // ms until the next reconnect attempt (when status === "closed")
  reconnectInMs: number | null;
  onLogMessage: (cb: (m: WsLogMessage) => void) => void;
}

// Connect to the dashboard WebSocket (same origin) and auto-reconnect with
// exponential backoff. Callbacks are stored in refs so callers can pass inline
// closures without forcing a reconnect/resubscribe cycle.
export function useDashboardSocket(): UseDashboardSocket {
  const [status, setStatus] = useState<WsStatus>("connecting");
  const [reconnectInMs, setReconnectInMs] = useState<number | null>(null);

  const logRef = useRef<((m: WsLogMessage) => void) | null>(null);

  // Keep the latest callback without touching the socket lifecycle.
  const onLogMessage = (cb: (m: WsLogMessage) => void) => {
    logRef.current = cb;
  };

  useEffect(() => {
    let ws: WebSocket | null = null;
    let closedByUs = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let countdownTimer: ReturnType<typeof setInterval> | null = null;
    let attempt = 0;

    const wsUrl = buildWsUrl();

    const connect = () => {
      setStatus("connecting");
      setReconnectInMs(null);
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        attempt = 0;
        setStatus("open");
        setReconnectInMs(null);
      };

      ws.onmessage = (event) => {
        let msg: unknown = null;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }
        if (!msg || typeof msg !== "object") return;
        const type = (msg as { type?: string }).type;
        if (type === "log") {
          logRef.current?.(msg as WsLogMessage);
        }
      };

      ws.onclose = () => {
        if (closedByUs) return;
        scheduleReconnect();
      };

      ws.onerror = () => {
        // Let onclose handle reconnect scheduling.
        ws?.close();
      };
    };

    const scheduleReconnect = () => {
      setStatus("closed");
      // Exponential backoff capped at 10s.
      const delay = Math.min(1000 * 2 ** attempt, 10000);
      attempt += 1;
      setReconnectInMs(delay);

      let remaining = delay;
      countdownTimer = setInterval(() => {
        remaining -= 1000;
        setReconnectInMs(remaining > 0 ? remaining : 0);
      }, 1000);

      reconnectTimer = setTimeout(() => {
        if (countdownTimer) {
          clearInterval(countdownTimer);
          countdownTimer = null;
        }
        setReconnectInMs(null);
        connect();
      }, delay);
    };

    connect();

    return () => {
      closedByUs = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (countdownTimer) clearInterval(countdownTimer);
      ws?.close();
    };
  }, []);

  return { status, reconnectInMs, onLogMessage };
}

// Build a ws:// or wss:// URL from the current page origin (dashboard is
// served same-origin by the backend, so the WS endpoint lives at /ws). When
// PROCM_HTTP_TOKEN is in use, a token may be appended via ?token=; read from
// the page URL if the operator passed it.
function buildWsUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const base = `${proto}//${window.location.host}/ws`;
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}

export type { ProcessStream };
