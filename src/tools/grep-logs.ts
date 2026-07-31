import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { textResult, notFoundResult } from "../tool-helpers.js";
import { logToolStart, logToolEnd, logToolError } from "../server-log.js";
import { toErrorMessage } from "../error.js";
import { getProcess } from "../process-manager.js";
import { ProcessStdoutChunk } from "../process-stdout-client.js";

export function registerGrepLogsTools(server: McpServer) {
  server.tool(
    "grep-process-logs",
    "Search a single process's stdout/stderr logs with a regular expression. Results are newest-first.",
    {
      id: z.string(),
      pattern: z.string(),
      stream: z.enum(["stdout", "stderr"]).optional(),
      ignoreCase: z.boolean().optional(),
      count: z.number().optional(),
    },
    async ({
      id,
      pattern,
      stream,
      ignoreCase = false,
      count = 50,
    }) => {
      logToolStart("grep-process-logs", { id, pattern, stream, ignoreCase, count });

      try {
        const processMetadata = getProcess(id);
        if (!processMetadata) {
          return notFoundResult(id);
        }

        let regex: RegExp;
        try {
          regex = new RegExp(pattern, ignoreCase ? "i" : "");
        } catch (error) {
          return textResult(
            `Invalid regular expression: ${toErrorMessage(error)}`,
          );
        }

        type StreamResult = { stream: "stdout" | "stderr"; chunk: ProcessStdoutChunk };
        const streams: Array<"stdout" | "stderr"> =
          stream ? [stream] : ["stdout", "stderr"];

        const collected: StreamResult[] = [];
        for (const s of streams) {
          const client = s === "stdout"
            ? processMetadata.stdoutClient
            : processMetadata.stderrClient;
          const chunks = await client.search(regex, count);
          for (const chunk of chunks) {
            collected.push({ stream: s, chunk });
          }
        }

        if (collected.length === 0) {
          return textResult(
            `No matches found in process ${id} for pattern: ${pattern}`,
          );
        }

        // Newest-first overall, each stream's results are already newest-first.
        collected.sort(
          (a, b) => b.chunk.timestamp.getTime() - a.chunk.timestamp.getTime(),
        );
        const trimmed = collected.slice(0, count);

        logToolEnd("grep-process-logs", { id, matches: trimmed.length });

        const body = trimmed
          .map(
            (r) =>
              `[${r.chunk.timestamp.toISOString()}] (${r.stream}) ${r.chunk.message}`,
          )
          .join("\n");

        return textResult(
          `${trimmed.length} match(es) for /${pattern}/ in process ${id}:\n${body}`,
        );
      } catch (error) {
        logToolError("grep-process-logs", error);
        return textResult(`Error grepping process logs: ${toErrorMessage(error)}`);
      }
    },
  );
}
