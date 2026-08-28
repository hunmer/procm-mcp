import path from "path";
import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import { mkdirp } from "mkdirp";
import { ProcmMcpDir } from "./procm-mcp-dir.js";

export interface RoomRecord {
  id: string;
  title: string;
  note: string;
  processIds: string[];
  createdAt: number;
  updatedAt: number;
  clientHistory?: Array<{ memberId: string; connectionId: string; clientName: string; processId?: string; connectedAt: number; metadata?: Record<string, unknown> }>;
}

type RoomsDb = { rooms: RoomRecord[] };
let dbPromise: Promise<Low<RoomsDb>> | null = null;

async function getDb(): Promise<Low<RoomsDb>> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const dir = ProcmMcpDir();
      await mkdirp(dir);
      const db = new Low<RoomsDb>(new JSONFile(path.join(dir, "rooms.json")), { rooms: [] });
      await db.read();
      await db.write();
      return db;
    })();
  }
  return dbPromise;
}

export async function listRoomRecords(): Promise<RoomRecord[]> {
  const db = await getDb();
  await db.read();
  return db.data.rooms.map((room) => ({ ...room, processIds: [...room.processIds], clientHistory: [...(room.clientHistory ?? [])] }));
}

export async function getRoomRecord(id: string): Promise<RoomRecord | undefined> {
  return (await listRoomRecords()).find((room) => room.id === id);
}

export async function ensureRoom(id: string, processId?: string): Promise<RoomRecord> {
  const db = await getDb();
  await db.read();
  let room = db.data.rooms.find((item) => item.id === id);
  const now = Date.now();
  if (!room) {
    room = { id, title: id, note: "", processIds: [], createdAt: now, updatedAt: now, clientHistory: [] };
    db.data.rooms.push(room);
  }
  if (processId && !room.processIds.includes(processId)) {
    room.processIds.push(processId);
    room.updatedAt = now;
  }
  await db.write();
  return { ...room, processIds: [...room.processIds], clientHistory: [...(room.clientHistory ?? [])] };
}

export async function rememberRoomClient(id: string, client: NonNullable<RoomRecord["clientHistory"]>[number]): Promise<void> {
  const db = await getDb();
  await db.read();
  const room = db.data.rooms.find((item) => item.id === id);
  if (!room) return;
  room.clientHistory ??= [];
  const index = room.clientHistory.findIndex((item) => item.memberId === client.memberId);
  if (index >= 0) room.clientHistory[index] = client;
  else room.clientHistory.push(client);
  room.updatedAt = Date.now();
  await db.write();
}

export async function updateRoom(
  id: string,
  patch: { title?: string; note?: string },
): Promise<RoomRecord> {
  const room = await ensureRoom(id);
  const db = await getDb();
  await db.read();
  const stored = db.data.rooms.find((item) => item.id === room.id)!;
  if (patch.title !== undefined) stored.title = patch.title.trim() || id;
  if (patch.note !== undefined) stored.note = patch.note.trim();
  stored.updatedAt = Date.now();
  await db.write();
  return { ...stored, processIds: [...stored.processIds] };
}

export async function removeProcessFromRooms(processId: string): Promise<void> {
  const db = await getDb();
  await db.read();
  let changed = false;
  for (const room of db.data.rooms) {
    const next = room.processIds.filter((id) => id !== processId);
    if (next.length !== room.processIds.length) {
      room.processIds = next;
      room.updatedAt = Date.now();
      changed = true;
    }
  }
  if (changed) await db.write();
}
