import { WebSocket } from "ws";
import {
  PROCM_PROTOCOL_VERSION,
  matchesTopic,
  parseClientFrame,
  type JsonValue,
  type RoomMember,
  type RoomMessage,
  type ServerFrame,
} from "@hunmer/procm-mcp-sdk";
import { nanoid } from "nanoid";
import { ensureRoom, listRoomRecords, getRoomRecord, updateRoom, type RoomRecord } from "./room-repository.js";
import { serverLog } from "./server-log.js";
import { putTrace, TraceStoreError } from "./trace-store.js";

interface Subscription { topic: string; prefix: boolean }
interface Session {
  socket: WebSocket;
  member: RoomMember;
  roomId: string;
  subscriptions: Map<string, Subscription>;
}

export interface RoomView extends RoomRecord {
  members: RoomMember[];
}

const sessionsByRoom = new Map<string, Map<string, Session>>();
const retainedByRoom = new Map<string, Map<string, RoomMessage>>();

function send(socket: WebSocket, frame: ServerFrame): void {
  if (socket.readyState === WebSocket.OPEN && socket.bufferedAmount < 4 * 1024 * 1024) {
    socket.send(JSON.stringify(frame));
  }
}

function sendError(socket: WebSocket, code: string, message: string, requestId?: string): void {
  send(socket, { version: PROCM_PROTOCOL_VERSION, type: "error", code, message, requestId });
}

function broadcastMember(session: Session, event: "joined" | "left" | "replaced"): void {
  const room = sessionsByRoom.get(session.roomId);
  if (!room) return;
  for (const peer of room.values()) {
    if (peer.socket !== session.socket) {
      send(peer.socket, {
        version: PROCM_PROTOCOL_VERSION,
        type: "member",
        roomId: session.roomId,
        event,
        member: session.member,
      });
    }
  }
}

export function attachRoomSocket(socket: WebSocket): void {
  let session: Session | null = null;
  const helloTimer = setTimeout(() => socket.close(1008, "hello timeout"), 5_000);

  socket.on("message", async (raw) => {
    let value: unknown;
    try {
      value = JSON.parse(raw.toString());
    } catch {
      sendError(socket, "invalid_json", "Message must be valid JSON");
      return;
    }
    const frame = parseClientFrame(value);
    if (!frame) {
      sendError(socket, "invalid_frame", "Unsupported or malformed protocol frame");
      return;
    }

    if (frame.type === "hello") {
      if (session) return sendError(socket, "already_joined", "hello may only be sent once");
      if (!frame.roomId.trim() || !frame.memberId.trim() || !frame.clientName.trim()) {
        return sendError(socket, "invalid_identity", "roomId, memberId, and clientName are required");
      }
      clearTimeout(helloTimer);
      await ensureRoom(frame.roomId, frame.processId);
      let room = sessionsByRoom.get(frame.roomId);
      if (!room) {
        room = new Map();
        sessionsByRoom.set(frame.roomId, room);
      }
      const prior = room.get(frame.memberId);
      const member: RoomMember = {
        memberId: frame.memberId,
        connectionId: nanoid(10),
        clientName: frame.clientName,
        processId: frame.processId,
        connectedAt: Date.now(),
        metadata: frame.metadata,
      };
      session = { socket, member, roomId: frame.roomId, subscriptions: new Map() };
      room.set(frame.memberId, session);
      if (prior) {
        broadcastMember(session, "replaced");
        prior.socket.close(4001, "member replaced");
      } else {
        broadcastMember(session, "joined");
      }
      send(socket, {
        version: PROCM_PROTOCOL_VERSION,
        type: "welcome",
        roomId: frame.roomId,
        member,
        members: [...room.values()].map((item) => item.member),
      });
      return;
    }

    if (!session) return sendError(socket, "hello_required", "Send hello before other frames");
    if (frame.type === "ping") {
      send(socket, { version: PROCM_PROTOCOL_VERSION, type: "pong", timestamp: frame.timestamp });
      return;
    }
    if (frame.type === "subscribe") {
      session.subscriptions.set(frame.subscriptionId, { topic: frame.topic, prefix: frame.prefix === true });
      const retained = retainedByRoom.get(session.roomId);
      if (retained) {
        for (const message of retained.values()) {
          if (matchesTopic(message.topic, frame.topic, frame.prefix === true)) send(socket, message);
        }
      }
      return;
    }
    if (frame.type === "unsubscribe") {
      session.subscriptions.delete(frame.subscriptionId);
      return;
    }
    if (frame.type === "trace:put") {
      try {
        await putTrace({
          version: 1,
          traceId: frame.traceId,
          createdAt: Date.now(),
          roomId: session.roomId,
          memberId: session.member.memberId,
          processId: session.member.processId,
          data: frame.payload,
        }, frame.ttlSeconds);
        send(socket, {
          version: PROCM_PROTOCOL_VERSION,
          type: "trace:stored",
          requestId: frame.requestId,
          traceId: frame.traceId,
        });
      } catch (error) {
        const normalized = error instanceof TraceStoreError
          ? error
          : new TraceStoreError("TRACE_STORE_ERROR", "Trace storage failed");
        sendError(socket, normalized.code, normalized.message, frame.requestId);
      }
      return;
    }
    if (frame.type === "publish") {
      const message: RoomMessage = {
        version: PROCM_PROTOCOL_VERSION,
        type: "message",
        roomId: session.roomId,
        messageId: frame.messageId,
        memberId: session.member.memberId,
        topic: frame.topic,
        timestamp: Date.now(),
        payload: frame.payload as JsonValue,
        retain: frame.retain,
        correlationId: frame.correlationId,
      };
      if (frame.retain) {
        let retained = retainedByRoom.get(session.roomId);
        if (!retained) {
          retained = new Map();
          retainedByRoom.set(session.roomId, retained);
        }
        retained.set(frame.topic, message);
      }
      const room = sessionsByRoom.get(session.roomId);
      if (room) {
        for (const peer of room.values()) {
          if ([...peer.subscriptions.values()].some((sub) => matchesTopic(frame.topic, sub.topic, sub.prefix))) {
            send(peer.socket, message);
          }
        }
      }
    }
  });

  const cleanup = () => {
    clearTimeout(helloTimer);
    if (!session) return;
    const room = sessionsByRoom.get(session.roomId);
    if (room?.get(session.member.memberId)?.socket !== socket) return;
    room.delete(session.member.memberId);
    broadcastMember(session, "left");
    if (room.size === 0) sessionsByRoom.delete(session.roomId);
  };
  socket.on("close", cleanup);
  socket.on("error", cleanup);
}

export async function listRooms(): Promise<RoomView[]> {
  const records = await listRoomRecords();
  return records.map((record) => ({
    ...record,
    members: [...(sessionsByRoom.get(record.id)?.values() ?? [])].map((session) => session.member),
  }));
}

export async function getRoom(id: string): Promise<RoomView | undefined> {
  const record = await getRoomRecord(id);
  if (!record) return undefined;
  return { ...record, members: [...(sessionsByRoom.get(id)?.values() ?? [])].map((session) => session.member) };
}

export async function patchRoom(id: string, patch: { title?: string; note?: string }): Promise<RoomView> {
  await updateRoom(id, patch);
  return (await getRoom(id))!;
}
