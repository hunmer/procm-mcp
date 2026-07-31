import { nanoid } from "nanoid";
import { log } from "./logger.js";
import { toErrorMessage } from "./error.js";

export const serverId = nanoid(6);
export const logServerId = `${serverId}(${process.pid})`;

export function serverLog(message: string) {
  log(message, { id: logServerId });
}

export function logToolStart(toolName: string, args: any) {
  serverLog(`Tool started: ${toolName} with args: ${JSON.stringify(args)}`);
}

export function logToolEnd(toolName: string, result: any) {
  serverLog(`Tool ended: ${toolName} with result: ${JSON.stringify(result)}`);
}

export function logToolError(toolName: string, error: any) {
  serverLog(`Tool error: ${toolName} - ${toErrorMessage(error)}`);
}
