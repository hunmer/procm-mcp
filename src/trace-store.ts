import { createClient, type RedisClientType } from "redis";
import { serverLog } from "./server-log.js";

export const TRACE_KEY_PREFIX = "procm:trace:v1:";
export const TRACE_DEFAULT_TTL_SECONDS = 86_400;
export const TRACE_MAX_BYTES = 262_144;
export const TRACE_MIN_TTL_SECONDS = 1;
export const TRACE_MAX_TTL_SECONDS = 604_800;

export interface StoredTraceEnvelope {
  version: 1;
  traceId: string;
  createdAt: number;
  roomId: string;
  memberId: string;
  processId?: string;
  data: unknown;
}

export class TraceStoreError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "TraceStoreError";
  }
}

let client: RedisClientType | null = null;
let connectPromise: Promise<RedisClientType> | null = null;

function configuredUrl(): string {
  const url = process.env.PROCM_REDIS_URL?.trim();
  if (!url) throw new TraceStoreError("TRACE_REDIS_NOT_CONFIGURED", "Trace storage is not configured");
  return url;
}

function configuredDefaultTtl(): number {
  const raw = process.env.PROCM_TRACE_TTL_SECONDS;
  if (raw === undefined || raw === "") return TRACE_DEFAULT_TTL_SECONDS;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < TRACE_MIN_TTL_SECONDS || value > TRACE_MAX_TTL_SECONDS) {
    throw new TraceStoreError("TRACE_INVALID_PAYLOAD", `PROCM_TRACE_TTL_SECONDS must be an integer from ${TRACE_MIN_TTL_SECONDS} to ${TRACE_MAX_TTL_SECONDS}`);
  }
  return value;
}

function normalizeUnavailable(error: unknown): TraceStoreError {
  if (error instanceof TraceStoreError) return error;
  return new TraceStoreError("TRACE_REDIS_UNAVAILABLE", "Trace storage is unavailable");
}

function discardClient(): void {
  const active = client;
  client = null;
  if (!active) return;
  try { active.destroy(); } catch { /* already closed */ }
}

async function getClient(): Promise<RedisClientType> {
  configuredUrl();
  if (client?.isReady) return client;
  if (connectPromise) return connectPromise;
  const next = createClient({
    url: configuredUrl(),
    socket: { connectTimeout: 1_000, reconnectStrategy: false },
  });
  next.on("error", () => serverLog("Trace Redis connection error"));
  client = next;
  connectPromise = next.connect().then(() => next).catch(async (error) => {
    if (client === next) client = null;
    try { next.destroy(); } catch { /* already closed */ }
    throw normalizeUnavailable(error);
  }).finally(() => {
    connectPromise = null;
  });
  return connectPromise;
}

export function validateTraceId(id: string): string {
  const normalized = id.trim();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(normalized)) {
    throw new TraceStoreError("TRACE_INVALID_ID", "Trace ID must be 1-128 characters using letters, numbers, '_' or '-'");
  }
  return normalized;
}

export function validateTraceTtl(ttlSeconds?: number): number {
  const ttl = ttlSeconds ?? configuredDefaultTtl();
  if (!Number.isInteger(ttl) || ttl < TRACE_MIN_TTL_SECONDS || ttl > TRACE_MAX_TTL_SECONDS) {
    throw new TraceStoreError("TRACE_INVALID_PAYLOAD", `Trace TTL must be an integer from ${TRACE_MIN_TTL_SECONDS} to ${TRACE_MAX_TTL_SECONDS}`);
  }
  return ttl;
}

export async function putTrace(envelope: StoredTraceEnvelope, ttlSeconds?: number): Promise<void> {
  const id = validateTraceId(envelope.traceId);
  const ttl = validateTraceTtl(ttlSeconds);
  let serialized: string;
  try {
    serialized = JSON.stringify(envelope);
  } catch {
    throw new TraceStoreError("TRACE_INVALID_PAYLOAD", "Trace payload must be JSON serializable");
  }
  if (Buffer.byteLength(serialized, "utf8") > TRACE_MAX_BYTES) {
    throw new TraceStoreError("TRACE_INVALID_PAYLOAD", `Trace payload exceeds ${TRACE_MAX_BYTES} bytes`);
  }
  try {
    const redis = await getClient();
    const result = await redis.set(`${TRACE_KEY_PREFIX}${id}`, serialized, { NX: true, EX: ttl });
    if (result !== "OK") throw new TraceStoreError("TRACE_STORE_CONFLICT", "Trace ID already exists");
  } catch (error) {
    if (!(error instanceof TraceStoreError)) discardClient();
    throw normalizeUnavailable(error);
  }
}

export async function getTrace(id: string): Promise<StoredTraceEnvelope> {
  const normalized = validateTraceId(id);
  try {
    const redis = await getClient();
    const serialized = await redis.get(`${TRACE_KEY_PREFIX}${normalized}`);
    if (serialized === null) throw new TraceStoreError("TRACE_NOT_FOUND", "Trace was not found or has expired");
    return JSON.parse(serialized) as StoredTraceEnvelope;
  } catch (error) {
    if (!(error instanceof TraceStoreError)) discardClient();
    throw normalizeUnavailable(error);
  }
}

export async function closeTraceStore(): Promise<void> {
  const active = client;
  client = null;
  connectPromise = null;
  if (!active) return;
  try {
    if (active.isOpen) await active.close();
  } catch {
    try { active.destroy(); } catch { /* already closed */ }
  }
}
