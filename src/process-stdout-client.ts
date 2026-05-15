import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { ServerDir } from "./server-dir.js";
import { mkdirp } from "mkdirp";
import { log } from "./logger.js";
import { toErrorMessage } from "./error.js";
import { createLogsRepository } from "./logs-repository.js";

export type ProcessStdoutChunk = {
  timestamp: Date;
  message: string;
};

export type ProcessStdoutClient = {
  top: (count: number) => Promise<ProcessStdoutChunk[]>;
  close: () => Promise<void>;
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
  const filePath = path.join(serverDir, "processes", `${id}-${type}.sqlite3`);
  const textFilePath = path.join(serverDir, "processes", `${id}-${type}.log`);
  await mkdirp(path.dirname(filePath));

  const logsRepository = await createLogsRepository(filePath);
  await logsRepository.initialize();

  const updateQueue = createUpdateQueue();

  const onData = (chunk: Buffer) => {
    const message = chunk.toString().trim();
    const timestamp = Date.now();

    updateQueue.unshift(async () => {
      try {
        await Promise.all([
          logsRepository.insert({
            timestamp,
            message,
          }),
          new Promise<void>((resolve, reject) => {
            fs.appendFile(
              textFilePath,
              message,
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
    close: async () => {
      readable.off("data", onData);
      await logsRepository.close();
    },
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
