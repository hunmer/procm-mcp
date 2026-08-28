import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { textResult, notFoundResult } from "../tool-helpers.js";
import { logToolStart, logToolEnd, logToolError } from "../server-log.js";
import { toErrorMessage } from "../error.js";
import {
  sendProcessInput,
  ALLOWED_INPUT_SIGNALS,
} from "../process-manager.js";

export function registerProcessInputTools(server: McpServer) {
  // Send input to a running process: either a text line written to its stdin
  // (e.g. answering an interactive prompt, sending "yes\n"), or an OS signal
  // (e.g. SIGINT = Ctrl+C, SIGTERM = graceful stop). Exactly one of `text` or
  // `signal` must be provided. `newline` (default true) appends a trailing \n
  // so a single write reads as a complete line by the child — turn it off to
  // send raw bytes (e.g. control sequences).
  server.tool(
    "process-input",
    `Send input to a running process by ID.
- "text": write a string to the process's stdin. Set "newline" (default true) to append a trailing newline; pass false to send raw bytes.
- "signal": send an OS signal (e.g. "SIGINT" for Ctrl+C, "SIGTERM" for graceful stop, "SIGKILL" to force-kill).
Provide exactly one of "text" or "signal". Allowed signals: ${ALLOWED_INPUT_SIGNALS.join(", ")}.`,
    {
      id: z.string(),
      text: z.string().optional(),
      newline: z.boolean().optional(),
      signal: z.enum(ALLOWED_INPUT_SIGNALS).optional(),
    },
    async ({ id, text, newline = true, signal }) => {
      logToolStart("process-input", { id, hasText: text !== undefined, newline, signal });

      try {
        const result = sendProcessInput(id, { text, newline, signal });

        if (result.ok) {
          if (result.kind === "text") {
            logToolEnd("process-input", { id, kind: "text", bytes: result.bytes });
            return textResult(
              `Wrote ${result.bytes} byte(s) to stdin of process ${id}.`,
            );
          }
          logToolEnd("process-input", { id, kind: "signal", signal: result.signal });
          return textResult(
            `Sent signal ${result.signal} to process ${id}.`,
          );
        }

        // Discriminated failures. not_found mirrors the other tools' UX; the
        // rest surface the explanatory error string.
        if (result.reason === "not_found") {
          return notFoundResult(id);
        }
        logToolError("process-input", result.error || result.reason);
        return textResult(
          result.error || `Could not send input to process ${id} (${result.reason}).`,
        );
      } catch (error) {
        logToolError("process-input", error);
        return textResult(`Error sending input to process: ${toErrorMessage(error)}`);
      }
    },
  );
}
