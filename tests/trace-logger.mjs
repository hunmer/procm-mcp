import {
  PROCM_LOG_MARKER,
  createLogger,
  decodeStructuredLogLine,
  encodeStructuredLog,
} from "@procm-mcp/sdk";
import { assert, assertEqual, runTest, summarize } from "./_helpers.mjs";

await runTest("all logger methods encode optional traceId once", () => {
  const rows = [];
  const output = Object.fromEntries(["debug", "info", "warn", "error"].map((level) => [level, (line) => rows.push({ level, line })]));
  const logger = createLogger({ console: output, clientName: "test", memberId: "member" });
  logger.debug("debug", undefined, { traceId: "trace-debug" });
  logger.info("info", { ok: true }, { traceId: "trace-info" });
  logger.warn("warn", undefined, { traceId: "trace-warn" });
  logger.error("error", undefined, { traceId: "trace-error" });
  logger.log("info", "generic", undefined, { traceId: "trace-log" });
  assertEqual(rows.length, 5, "each logger call emits exactly one console row");
  for (const row of rows) {
    const decoded = decodeStructuredLogLine(row.line);
    assertEqual(decoded.traceId, `trace-${decoded.message === "generic" ? "log" : decoded.message}`, `${decoded.message} traceId is encoded`);
    assertEqual(row.line.split(PROCM_LOG_MARKER).length, 2, "row contains one structured marker");
  }
});

await runTest("legacy structured logs remain compatible", () => {
  const legacy = {
    version: 1,
    timestamp: 1,
    level: "info",
    memberId: "legacy",
    clientName: "legacy",
    message: "old",
  };
  const decoded = decodeStructuredLogLine(encodeStructuredLog(legacy));
  assertEqual(decoded.message, "old", "legacy log decodes");
  assertEqual(decoded.traceId, undefined, "legacy log has no traceId");

  const rows = [];
  createLogger({ console: { debug: (x) => rows.push(x), info: (x) => rows.push(x), warn: (x) => rows.push(x), error: (x) => rows.push(x) } })
    .info("no context", undefined, { traceId: /** @type {any} */ (123) });
  assertEqual(decodeStructuredLogLine(rows[0]).traceId, 123, "logger does not throw while encoding runtime context values");
  assert(!rows[0].includes("Redis") && !rows[0].includes("callChain"), "logger adds no trace or Redis detail text");
});

summarize();
