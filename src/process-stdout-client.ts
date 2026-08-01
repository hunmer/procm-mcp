import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { ServerDir } from "./server-dir.js";
import { mkdirp } from "mkdirp";
import { log } from "./logger.js";
import { toErrorMessage } from "./error.js";
import { createLogsRepository } from "./logs-repository.js";
import { dashboardEvents } from "./events.js";

export type ProcessStdoutChunk = {
  timestamp: Date;
  message: string;
};

export type ProcessStdoutClient = {
  top: (count: number) => Promise<ProcessStdoutChunk[]>;
  search: (
    pattern: RegExp,
    count?: number,
  ) => Promise<ProcessStdoutChunk[]>;
  close: () => Promise<void>;
  // Absolute path to the append-only plain-text log file
  // (<serverDir>/processes/<id>-<type>.log). Exposed so the HTTP layer can
  // report it (copy file location) and stream it (download log file).
  textFilePath: string;
};

export async function createProcessStdoutClient({
  id,
  type,
  readable,
  serverId,
}: {
  id: string;
  type: "stdout" | "stderr";
  readable: Readable;
  serverId: string;
}): Promise<ProcessStdoutClient> {
  const serverDir = ServerDir({ serverId });
  const filePath = path.join(serverDir, "processes", `${id}-${type}.json`);
  const textFilePath = path.join(serverDir, "processes", `${id}-${type}.log`);
  await mkdirp(path.dirname(filePath));

  const logsRepository = await createLogsRepository(filePath);
  await logsRepository.initialize();

  const updateQueue = createUpdateQueue();

  const onData = (chunk: Buffer) => {
    const message = chunk.toString().trim();
    const timestamp = Date.now();

    // Broadcast the new log line to live subscribers (e.g. the WebSocket
    // broadcaster) immediately and independently of disk/db persistence — the
    // UI should never wait on lowdb's full read+write cycle.
    if (message) {
      dashboardEvents.emitLog({ processId: id, stream: type, timestamp, message });
    }

    updateQueue.unshift(async () => {
      try {
        await Promise.all([
          logsRepository.insert({
            timestamp,
            message,
          }),
          new Promise<void>((resolve, reject) => {
            // Append with a trailing newline so the on-disk .log file is
            // line-delimited. Without it, the file is one run-on blob and the
            // closed-process log view (which reads this file directly) renders
            // every message jammed together on a single line.
            fs.appendFile(
              textFilePath,
              message.endsWith("\n") ? message : `${message}\n`,
              { encoding: "utf8" },
              (err) => {
                if (err) {
                  reject(err);
                } else {
                  resolve();
                }
              }
            );
          }),
        ]);
      } catch (error) {
        serverLog(`Error writing log: ${toErrorMessage(error)}`, serverId);
      }
    });
  };

  readable.on("data", onData);

  return {
    top: async (count: number) => {
      await updateQueue.processing;

      const rows = await logsRepository.top(count);
      return rows.map((row) => ({
        timestamp: new Date(row.timestamp),
        message: row.message,
      }));
    },
    search: async (pattern: RegExp, count?: number) => {
      await updateQueue.processing;

      const rows = await logsRepository.search(pattern, count);
      return rows.map((row) => ({
        timestamp: new Date(row.timestamp),
        message: row.message,
      }));
    },
    close: async () => {
      readable.off("data", onData);
      await logsRepository.close();
    },
    textFilePath,
  };
}

function createUpdateQueue() {
  let processing = Promise.resolve();

  return {
    processing,
    unshift: (fn: () => Promise<void>) => {
      processing = processing.then(() => {
        return new Promise<void>(async (resolve, reject) => {
          try {
            await fn();
            resolve();
          } catch (error) {
            reject(error);
          }
        });
      });
    },
  };
}

function serverLog(message: string, serverId: string) {
  log(message, { id: serverId });
}
