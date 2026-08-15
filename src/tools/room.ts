import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getRoom, listRooms, patchRoom } from "../room-hub.js";
import { queryRoomLogs } from "../room-logs.js";
import { textResult } from "../tool-helpers.js";
import { toErrorMessage } from "../error.js";
import { logToolEnd, logToolError, logToolStart } from "../server-log.js";

export function registerRoomTools(server: McpServer): void {
  server.tool(
    "room",
    "List, inspect, or update room metadata and active members.",
    {
      action: z.enum(["list", "get", "update"]),
      roomId: z.string().optional(),
      title: z.string().optional(),
      note: z.string().optional(),
    },
    async ({ action, roomId, title, note }) => {
      logToolStart("room", { action, roomId });
      try {
        if (action !== "list" && !roomId) return textResult(`room action "${action}" requires roomId.`);
        const result = action === "list"
          ? await listRooms()
          : action === "get"
            ? await getRoom(roomId!)
            : await patchRoom(roomId!, { title, note });
        logToolEnd("room", { action, roomId });
        return textResult(JSON.stringify(result ?? null, null, 2));
      } catch (error) {
        logToolError("room", error);
        return textResult(`Error managing room: ${toErrorMessage(error)}`);
      }
    },
  );

  server.tool(
    "room-logs",
    "Read structured logs for all processes in a room, optionally filtering by member/client prefix, level, and trace ID.",
    {
      roomId: z.string(),
      memberPrefix: z.string().optional(),
      level: z.enum(["debug", "info", "warn", "error"]).optional(),
      traceId: z.string().optional(),
      count: z.number().int().min(1).max(5000).optional(),
    },
    async ({ roomId, memberPrefix, level, traceId, count }) => {
      logToolStart("room-logs", { roomId, memberPrefix, level, traceId, count });
      try {
        const entries = await queryRoomLogs(roomId, { memberPrefix, level, traceId, count });
        if (!entries) return textResult(`Room ${roomId} not found.`);
        logToolEnd("room-logs", { roomId, count: entries.length });
        return textResult(JSON.stringify({ roomId, entries }, null, 2));
      } catch (error) {
        logToolError("room-logs", error);
        return textResult(`Error reading room logs: ${toErrorMessage(error)}`);
      }
    },
  );
}
