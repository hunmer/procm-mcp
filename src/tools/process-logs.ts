import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { textResult, notFoundResult } from "../tool-helpers.js";
import { logToolStart, logToolEnd, logToolError } from "../server-log.js";
import { toErrorMessage } from "../error.js";
import { getProcess } from "../process-manager.js";
import { ProcessStdoutChunk } from "../process-stdout-client.js";
import { decodeStructuredLogLine, stripStructuredLogFrame } from "@hunmer/procm-mcp-sdk";

function formatChunk(chunk: ProcessStdoutChunk, stream?: "stdout" | "stderr"): string {
  const structured = decodeStructuredLogLine(chunk.message);
  if (!structured) {
    const prefix = stream ? ` (${stream})` : "";
    return `[${chunk.timestamp.toISOString()}]${prefix} ${stripStructuredLogFrame(chunk.message)}`;
  }

  const timestamp = new Date(structured.timestamp).toISOString();
  const data = structured.data === undefined ? "" : ` ${JSON.stringify(structured.data)}`;
  const streamLabel = stream ? ` (${stream})` : "";
  return `[${timestamp}]${streamLabel} ${structured.level.toUpperCase()} ${structured.clientName}: ${structured.message}${data}`;
}

export function registerProcessLogTools(server: McpServer) {
  // Unified logs tool: tail recent stdout/stderr OR grep them with a regex.
  //   - No `pattern`: tail the most recent chunks of a single stream
  //     (stream defaults to "stdout", count defaults to 10).
  //   - With `pattern`: regex-search. `stream` optional (omit = search both),
  //     count defaults to 50, results newest-first.
  server.tool(
    "process-logs",
    `Read a process's logs by ID.
- Without "pattern": tail the most recent chunks of one stream (stream defaults to "stdout"; count defaults to 10).
- With "pattern": regex-search the logs (results newest-first; stream optional, omit to search both stdout and stderr; count defaults to 50; set ignoreCase for a case-insensitive match).`,
    {
      id: z.string(),
      stream: z.enum(["stdout", "stderr"]).optional(),
      pattern: z.string().optional(),
      count: z.number().optional(),
      ignoreCase: z.boolean().optional(),
    },
    async ({
      id,
      stream,
      pattern,
      ignoreCase = false,
      count,
    }) => {
      logToolStart("process-logs", { id, stream, pattern, ignoreCase, count });

      try {
        const meta = getProcess(id);
        if (!meta) {
          return notFoundResult(id);
        }

        // ---- grep mode -------------------------------------------------
        if (pattern !== undefined) {
          const limit = count ?? 50;

          let regex: RegExp;
          try {
            regex = new RegExp(pattern, ignoreCase ? "i" : "");
          } catch (error) {
            return textResult(
              `Invalid regular expression: ${toErrorMessage(error)}`,
            );
          }

          type StreamResult = {
            stream: "stdout" | "stderr";
            chunk: ProcessStdoutChunk;
          };
          const streams: Array<"stdout" | "stderr"> = stream
            ? [stream]
            : ["stdout", "stderr"];

          const collected: StreamResult[] = [];
          for (const s of streams) {
            const client = s === "stdout" ? meta.stdoutClient : meta.stderrClient;
            const chunks = await client.search(regex, limit);
            for (const chunk of chunks) {
              collected.push({ stream: s, chunk });
            }
          }

          if (collected.length === 0) {
            return textResult(
              `No matches found in process ${id} for pattern: ${pattern}`,
            );
          }

          // Newest-first overall; each stream's results are already newest-first.
          collected.sort(
            (a, b) => b.chunk.timestamp.getTime() - a.chunk.timestamp.getTime(),
          );
          const trimmed = collected.slice(0, limit);

          logToolEnd("process-logs", { id, mode: "grep", matches: trimmed.length });

          const body = trimmed
            .map(
              (r) =>
                formatChunk(r.chunk, r.stream),
            )
            .join("\n");

          return textResult(
            `${trimmed.length} match(es) for /${pattern}/ in process ${id}:\n${body}`,
          );
        }

        // ---- tail mode -------------------------------------------------
        const s = stream ?? "stdout";
        const limit = count ?? 10;
        const client = s === "stderr" ? meta.stderrClient : meta.stdoutClient;
        const chunks = await client.top(limit);

        if (chunks.length === 0) {
          return textResult(`No ${s} found for process with ID ${id}.`);
        }

        const text = chunks
          .map((c) => formatChunk(c))
          .join("\n");

        logToolEnd("process-logs", { id, mode: "tail", stream: s, count: chunks.length });

        return textResult(text);
      } catch (error) {
        logToolError("process-logs", error);
        return textResult(`Error reading process logs: ${toErrorMessage(error)}`);
      }
    },
  );
}
