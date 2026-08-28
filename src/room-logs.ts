import { appendFile, mkdir, open, stat } from "fs/promises";
import path from "path";
import { decodeStructuredLogLine, stripStructuredLogFrame, type JsonValue, type LogLevel, type RoomMember, type StructuredLog } from "@hunmer/procm-mcp-sdk";
import { getRoomRecord } from "./room-repository.js";
import { listProcessRecords } from "./process-manager.js";
import { ProcmMcpDir } from "./procm-mcp-dir.js";

export interface RoomLogEntry {
  timestamp: number;
  roomId: string;
  processId: string;
  stream: "stdout" | "stderr";
  message: string;
  level?: LogLevel;
  memberId?: string;
  clientName?: string;
  data?: JsonValue;
  traceId?: string;
}

export interface RoomLogQuery {
  memberPrefix?: string;
  level?: LogLevel;
  traceId?: string;
  count?: number;
  startTime?: number;
  endTime?: number;
}

function publishedLogPath(roomId: string): string {
  return path.join(ProcmMcpDir(), "room-logs", `${Buffer.from(roomId).toString("base64url")}.jsonl`);
}

export async function persistPublishedRoomLog(roomId: string, member: RoomMember, payload: JsonValue): Promise<void> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return;
  const log = payload as unknown as Partial<StructuredLog>;
  if (typeof log.timestamp !== "number" || !["debug", "info", "warn", "error"].includes(String(log.level)) || typeof log.message !== "string") return;
  const entry: RoomLogEntry = {
    timestamp: log.timestamp,
    roomId,
    processId: member.processId ?? member.memberId,
    stream: "stdout",
    message: log.message,
    level: log.level,
    memberId: log.memberId ?? member.memberId,
    clientName: log.clientName ?? member.clientName,
    data: log.data,
    traceId: log.traceId,
  };
  const filePath = publishedLogPath(roomId);
  await mkdir(path.dirname(filePath), { recursive: true });
  await appendFile(filePath, `${JSON.stringify(entry)}\n`, "utf8");
}

async function readTail(filePath: string, maxBytes = 2 * 1024 * 1024): Promise<string> {
  try {
    const info = await stat(filePath);
    const length = Math.min(info.size, maxBytes);
    const handle = await open(filePath, "r");
    try {
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, Math.max(0, info.size - length));
      const text = buffer.toString("utf8");
      return info.size > length ? text.slice(text.indexOf("\n") + 1) : text;
    } finally {
      await handle.close();
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
}

function parseLine(raw: string, roomId: string, processId: string, stream: "stdout" | "stderr", seq: number): RoomLogEntry | null {
  if (!raw) return null;
  const timestampMatch = raw.match(/^\[(.+?)\]\s?(.*)$/);
  const body = timestampMatch ? timestampMatch[2] : raw;
  const structured = decodeStructuredLogLine(body);
  const parsedTimestamp = timestampMatch ? Date.parse(timestampMatch[1]) : NaN;
  return {
    timestamp: structured?.timestamp ?? (Number.isNaN(parsedTimestamp) ? seq : parsedTimestamp),
    roomId,
    processId,
    stream,
    message: structured?.message ?? stripStructuredLogFrame(body),
    level: structured?.level,
    memberId: structured?.memberId,
    clientName: structured?.clientName,
    data: structured?.data,
    traceId: structured?.traceId,
  };
}

export async function queryRoomLogs(roomId: string, query: RoomLogQuery = {}): Promise<RoomLogEntry[] | null> {
  const room = await getRoomRecord(roomId);
  if (!room) return null;
  const recordById = new Map((await listProcessRecords()).map((record) => [record.id, record]));
  const rows: Array<RoomLogEntry & { seq: number }> = [];
  let seq = 0;
  const published = await readTail(publishedLogPath(roomId));
  for (const raw of published.split("\n")) {
    if (!raw) continue;
    try {
      const row = JSON.parse(raw) as RoomLogEntry;
      if (query.level && row.level !== query.level) continue;
      if (query.traceId && row.traceId !== query.traceId) continue;
      if (query.memberPrefix && !row.memberId?.startsWith(query.memberPrefix) && !row.clientName?.startsWith(query.memberPrefix)) continue;
      if (query.startTime !== undefined && row.timestamp < query.startTime) continue;
      if (query.endTime !== undefined && row.timestamp > query.endTime) continue;
      rows.push({ ...row, seq: seq++ });
    } catch { /* ignore incomplete or malformed JSONL rows */ }
  }
  for (const processId of room.processIds) {
    const record = recordById.get(processId);
    if (!record) continue;
    for (const [stream, filePath] of [["stdout", record.stdoutLogPath], ["stderr", record.stderrLogPath]] as const) {
      if (!filePath) continue;
      const text = await readTail(filePath);
      for (const raw of text.split("\n")) {
        const row = parseLine(raw, roomId, processId, stream, seq++);
        if (!row) continue;
        if (query.level && row.level !== query.level) continue;
        if (query.traceId && row.traceId !== query.traceId) continue;
        if (query.memberPrefix && !row.memberId?.startsWith(query.memberPrefix) && !row.clientName?.startsWith(query.memberPrefix)) continue;
        if (query.startTime !== undefined && row.timestamp < query.startTime) continue;
        if (query.endTime !== undefined && row.timestamp > query.endTime) continue;
        rows.push({ ...row, seq });
      }
    }
  }
  rows.sort((a, b) => a.timestamp - b.timestamp || a.processId.localeCompare(b.processId) || a.stream.localeCompare(b.stream) || a.seq - b.seq);
  const count = Math.min(Math.max(query.count ?? 500, 1), 5000);
  return rows.slice(-count).map(({ seq: _seq, ...row }) => row);
}
