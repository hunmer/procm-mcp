import { type ProcmClient } from "./client.js";
import { type JsonValue } from "./protocol.js";

const CUSTOM_EXECUTION_TOPIC = "$procm/custom-execution";

export type CustomExecutionFunction<TContext = unknown, TResult = JsonValue> = (
  context: TContext,
  ...args: JsonValue[]
) => TResult | Promise<TResult>;

export interface ExposeCustomExecutionOptions<TContext = unknown> {
  target?: string;
  context?: TContext;
}

export interface ExecuteCustomOptions {
  timeout?: number;
  signal?: AbortSignal;
}

interface CustomExecutionRequest {
  requestId: string;
  replyTopic: string;
  source: string;
  args: JsonValue[];
}

interface CustomExecutionSuccess {
  requestId: string;
  ok: true;
  value: JsonValue;
}

interface CustomExecutionFailure {
  requestId: string;
  ok: false;
  error: { name: string; message: string };
}

type CustomExecutionResult = CustomExecutionSuccess | CustomExecutionFailure;

export class CustomExecutionError extends Error {
  constructor(name: string, message: string) {
    super(message);
    this.name = name;
  }
}

export function exposeCustomExecution<TContext = undefined>(
  client: ProcmClient,
  options: ExposeCustomExecutionOptions<TContext> = {},
): () => void {
  if (client.connectionState !== "open") {
    throw new Error("custom execution can only be exposed after the procm client is connected");
  }
  const target = options.target ?? client.clientName;
  if (!target) throw new Error("custom execution target is required");

  return client.subscribe(customExecutionRequestTopic(target), (message) => {
    void handleRequest(client, message.payload, options.context as TContext);
  });
}

export async function executeCustom<TResult = JsonValue, TContext = unknown>(
  client: ProcmClient,
  target: string,
  execute: CustomExecutionFunction<TContext, TResult>,
  args: JsonValue[] = [],
  options: ExecuteCustomOptions = {},
): Promise<TResult> {
  if (client.connectionState !== "open") {
    throw new Error("custom execution requires a connected procm client");
  }
  if (!target) throw new Error("custom execution target is required");
  if (typeof execute !== "function") throw new Error("custom execution function is required");

  const requestId = randomId();
  const replyTopic = `${CUSTOM_EXECUTION_TOPIC}/result/${encodeURIComponent(client.memberId)}/${requestId}`;
  const resultPromise = client.waitFor<CustomExecutionResult & JsonValue>(replyTopic, {
    timeout: options.timeout ?? 5_000,
    signal: options.signal,
    filter: (payload) => payload.requestId === requestId,
  });
  client.publish(customExecutionRequestTopic(target), {
    requestId,
    replyTopic,
    source: execute.toString(),
    args,
  });

  const result = (await resultPromise).payload as unknown as CustomExecutionResult;
  if (!result.ok) throw new CustomExecutionError(result.error.name, result.error.message);
  return result.value as TResult;
}

async function handleRequest<TContext>(client: ProcmClient, payload: JsonValue, context: TContext): Promise<void> {
  if (!isCustomExecutionRequest(payload)) return;
  try {
    const execute = evaluateFunction<TContext>(payload.source);
    const value = toJsonValue(await execute(context, ...payload.args));
    client.publish(payload.replyTopic, { requestId: payload.requestId, ok: true, value });
  } catch (error) {
    const normalized = error instanceof Error ? error : new Error(String(error));
    client.publish(payload.replyTopic, {
      requestId: payload.requestId,
      ok: false,
      error: { name: normalized.name, message: normalized.message },
    });
  }
}

function evaluateFunction<TContext>(source: string): CustomExecutionFunction<TContext, unknown> {
  const evaluate = eval;
  const value: unknown = evaluate(`(${source})`);
  if (typeof value !== "function") throw new Error("custom execution source must evaluate to a function");
  return value as CustomExecutionFunction<TContext, unknown>;
}

function toJsonValue(value: unknown): JsonValue {
  if (value === undefined) return null;
  const serialized = JSON.stringify(value);
  if (serialized === undefined) return null;
  return JSON.parse(serialized) as JsonValue;
}

function customExecutionRequestTopic(target: string): string {
  return `${CUSTOM_EXECUTION_TOPIC}/request/${encodeURIComponent(target)}`;
}

function isCustomExecutionRequest(value: JsonValue): value is CustomExecutionRequest & JsonValue {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof value.requestId === "string" &&
    typeof value.replyTopic === "string" &&
    typeof value.source === "string" &&
    Array.isArray(value.args);
}

function randomId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
