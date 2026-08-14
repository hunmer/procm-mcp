export const PROCM_PROTOCOL_VERSION = 1 as const;
export const PROCM_LOG_TOPIC = "$procm/log";
export const PROCM_LOG_MARKER = "@@PROCM_LOG_V1@@";

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface RoomMember {
  memberId: string;
  connectionId: string;
  clientName: string;
  processId?: string;
  connectedAt: number;
  metadata?: Record<string, JsonValue>;
}

export interface RoomMessage<T = JsonValue> {
  version: typeof PROCM_PROTOCOL_VERSION;
  type: "message";
  roomId: string;
  messageId: string;
  memberId: string;
  topic: string;
  timestamp: number;
  payload: T;
  retain?: boolean;
}

export interface StructuredLog {
  version: typeof PROCM_PROTOCOL_VERSION;
  timestamp: number;
  level: LogLevel;
  memberId: string;
  clientName: string;
  processId?: string;
  message: string;
  data?: JsonValue;
}

export type ClientFrame =
  | {
      version: typeof PROCM_PROTOCOL_VERSION;
      type: "hello";
      roomId: string;
      memberId: string;
      clientName: string;
      processId?: string;
      metadata?: Record<string, JsonValue>;
    }
  | {
      version: typeof PROCM_PROTOCOL_VERSION;
      type: "subscribe";
      subscriptionId: string;
      topic: string;
      prefix?: boolean;
    }
  | {
      version: typeof PROCM_PROTOCOL_VERSION;
      type: "unsubscribe";
      subscriptionId: string;
    }
  | {
      version: typeof PROCM_PROTOCOL_VERSION;
      type: "publish";
      messageId: string;
      topic: string;
      timestamp: number;
      payload: JsonValue;
      retain?: boolean;
    }
  | { version: typeof PROCM_PROTOCOL_VERSION; type: "ping"; timestamp: number };

export type ServerFrame =
  | {
      version: typeof PROCM_PROTOCOL_VERSION;
      type: "welcome";
      roomId: string;
      member: RoomMember;
      members: RoomMember[];
    }
  | RoomMessage
  | {
      version: typeof PROCM_PROTOCOL_VERSION;
      type: "member";
      roomId: string;
      event: "joined" | "left" | "replaced";
      member: RoomMember;
    }
  | {
      version: typeof PROCM_PROTOCOL_VERSION;
      type: "error";
      code: string;
      message: string;
    }
  | { version: typeof PROCM_PROTOCOL_VERSION; type: "pong"; timestamp: number };

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseClientFrame(value: unknown): ClientFrame | null {
  if (!isRecord(value) || value.version !== PROCM_PROTOCOL_VERSION) return null;
  if (typeof value.type !== "string") return null;
  switch (value.type) {
    case "hello":
      return typeof value.roomId === "string" &&
        typeof value.memberId === "string" &&
        typeof value.clientName === "string"
        ? (value as unknown as ClientFrame)
        : null;
    case "subscribe":
      return typeof value.subscriptionId === "string" && typeof value.topic === "string"
        ? (value as unknown as ClientFrame)
        : null;
    case "unsubscribe":
      return typeof value.subscriptionId === "string"
        ? (value as unknown as ClientFrame)
        : null;
    case "publish":
      return typeof value.messageId === "string" &&
        typeof value.topic === "string" &&
        typeof value.timestamp === "number" &&
        "payload" in value
        ? (value as unknown as ClientFrame)
        : null;
    case "ping":
      return typeof value.timestamp === "number" ? (value as ClientFrame) : null;
    default:
      return null;
  }
}

export function parseServerFrame(value: unknown): ServerFrame | null {
  if (!isRecord(value) || value.version !== PROCM_PROTOCOL_VERSION || typeof value.type !== "string") {
    return null;
  }
  return ["welcome", "message", "member", "error", "pong"].includes(value.type)
    ? (value as unknown as ServerFrame)
    : null;
}

export function matchesTopic(topic: string, filter: string, prefix = false): boolean {
  return prefix ? topic.startsWith(filter) : topic === filter;
}

function encodeBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeBase64Url(text: string): string {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4);
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

export function encodeStructuredLog(log: StructuredLog): string {
  return `${PROCM_LOG_MARKER}${encodeBase64Url(JSON.stringify(log))}`;
}

export function decodeStructuredLogLine(line: string): StructuredLog | null {
  const markerIndex = line.lastIndexOf(PROCM_LOG_MARKER);
  if (markerIndex === -1) return null;
  try {
    const value: unknown = JSON.parse(decodeBase64Url(line.slice(markerIndex + PROCM_LOG_MARKER.length).trim()));
    if (!isRecord(value) || value.version !== PROCM_PROTOCOL_VERSION) return null;
    if (
      typeof value.timestamp !== "number" ||
      !["debug", "info", "warn", "error"].includes(String(value.level)) ||
      typeof value.memberId !== "string" ||
      typeof value.clientName !== "string" ||
      typeof value.message !== "string"
    ) return null;
    return value as unknown as StructuredLog;
  } catch {
    return null;
  }
}

export function stripStructuredLogFrame(line: string): string {
  const markerIndex = line.lastIndexOf(PROCM_LOG_MARKER);
  return markerIndex === -1 ? line : line.slice(0, markerIndex).trimEnd();
}
