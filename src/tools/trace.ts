import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getTrace, TraceStoreError } from "../trace-store.js";
import { textResult } from "../tool-helpers.js";

function response(value: unknown) {
  return textResult(JSON.stringify(value, null, 2));
}

export function registerTraceTools(server: McpServer): void {
  server.tool(
    "trace-get",
    "Read a stored trace by its exact ID.",
    { id: z.string() },
    async ({ id }) => {
      try {
        return response({ ok: true, trace: await getTrace(id) });
      } catch (error) {
        const normalized = error instanceof TraceStoreError
          ? error
          : new TraceStoreError("TRACE_STORE_ERROR", "Trace storage failed");
        return response({ ok: false, error: { code: normalized.code, message: normalized.message } });
      }
    },
  );
}
