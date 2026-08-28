import { LRUCache } from "lru-cache";

export const TRACE_DEFAULT_TTL_SECONDS = 86_400;
export const TRACE_MAX_BYTES = 262_144;
export const TRACE_CACHE_MAX_BYTES = 64 * 1024 * 1024;
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

const traces = new LRUCache<string, string>({
  maxSize: TRACE_CACHE_MAX_BYTES,
  sizeCalculation: (value) => Buffer.byteLength(value, "utf8"),
  ttlAutopurge: true,
  allowStale: false,
  updateAgeOnGet: false,
});

function configuredDefaultTtl(): number {
  const raw = process.env.PROCM_TRACE_TTL_SECONDS;
  if (raw === undefined || raw === "") return TRACE_DEFAULT_TTL_SECONDS;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < TRACE_MIN_TTL_SECONDS || value > TRACE_MAX_TTL_SECONDS) {
    throw new TraceStoreError("TRACE_INVALID_PAYLOAD", `PROCM_TRACE_TTL_SECONDS must be an integer from ${TRACE_MIN_TTL_SECONDS} to ${TRACE_MAX_TTL_SECONDS}`);
  }
  return value;
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
  if (traces.has(id)) throw new TraceStoreError("TRACE_STORE_CONFLICT", "Trace ID already exists");
  traces.set(id, serialized, { ttl: ttl * 1_000 });
}

export async function getTrace(id: string): Promise<StoredTraceEnvelope> {
  const normalized = validateTraceId(id);
  const serialized = traces.get(normalized);
  if (serialized === undefined) throw new TraceStoreError("TRACE_NOT_FOUND", "Trace was not found, expired, or evicted");
  return JSON.parse(serialized) as StoredTraceEnvelope;
}

export async function closeTraceStore(): Promise<void> {
  traces.clear();
}
