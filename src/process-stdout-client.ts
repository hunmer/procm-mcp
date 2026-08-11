import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { ServerDir } from "./server-dir.js";
import { mkdirp } from "mkdirp";
import { log } from "./logger.js";
import { toErrorMessage } from "./error.js";
import { dashboardEvents } from "./events.js";

export type ProcessStdoutChunk = {
  timestamp: Date;
  message: string;
};

export type ProcessStdoutClient = {
  top: (count: number) => Promise<ProcessStdoutChunk[]>;
  // Search the in-memory buffer for matching lines. `count` caps the number of
  // matches (newest-first); `after` adds up to that many trailing non-matching
  // lines following each match as context (deduped so adjacent matches don't
  // double-count the same lines). Context lines are included in the returned
  // array in addition to the matches themselves.
  search: (
    pattern: RegExp,
    count?: number,
    after?: number,
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
  const textFilePath = path.join(serverDir, "processes", `${id}-${type}.log`);
  await mkdirp(path.dirname(textFilePath));

  const updateQueue = createUpdateQueue();
  const recent: ProcessStdoutChunk[] = [];
  const maxRecent = 2000;

  const onData = (chunk: Buffer) => {
    const message = chunk.toString().trim();
    const timestamp = Date.now();
    if (message) {
      recent.push({ timestamp: new Date(timestamp), message });
      if (recent.length > maxRecent) recent.shift();
    }

    // Broadcast immediately; disk persistence is best-effort and bounded.
    if (message) {
      dashboardEvents.emitLog({ processId: id, stream: type, timestamp, message });
    }

    updateQueue.push(async () => {
      try {
        await new Promise<void>((resolve, reject) => {
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
          });
      } catch (error) {
        serverLog(`Error writing log: ${toErrorMessage(error)}`, serverId);
      }
    });
  };

  readable.on("data", onData);

  return {
    top: async (count: number) => {
      await updateQueue.processing;

      return recent.slice(-count).reverse();
    },
    search: async (pattern: RegExp, count?: number, after?: number) => {
      await updateQueue.processing;
      const limit = count ?? 50;
      const afterCount = Math.max(0, after ?? 0);

      // `recent` is chronological (oldest -> newest). Collect indices of
      // matching lines, keep only the most recent `limit` matches, then (if
      // requested) expand each match with up to `afterCount` trailing entries
      // as context. A Set dedupes so a line claimed as context by one match
      // and as a match (or context) by another isn't returned twice.
      const matchedIdx: number[] = [];
      for (let i = 0; i < recent.length; i++) {
        if (pattern.test(recent[i].message)) matchedIdx.push(i);
      }
      if (matchedIdx.length === 0) return [];

      const recentMatches = matchedIdx.slice(-limit);
      if (afterCount === 0) {
        return recentMatches.map((i) => recent[i]).reverse();
      }

      const keep = new Set<number>(recentMatches);
      for (const start of recentMatches) {
        const end = Math.min(recent.length - 1, start + afterCount);
        for (let j = start + 1; j <= end; j++) keep.add(j);
      }
      return Array.from(keep)
        .sort((a, b) => a - b)
        .map((i) => recent[i])
        .reverse();
    },
    close: async () => {
      readable.off("data", onData);
      await updateQueue.processing;
    },
    textFilePath,
  };
}

function createUpdateQueue() {
  let processing = Promise.resolve();
  let pending = 0;
  const maxPending = 1000;

  return {
    get processing() {
      return processing;
    },
    push: (fn: () => Promise<void>) => {
      if (pending >= maxPending) return;
      pending++;
      processing = processing.then(() => {
        return new Promise<void>(async (resolve, reject) => {
          try {
            await fn();
            resolve();
          } catch (error) {
            reject(error);
          } finally {
            pending--;
          }
        });
      });
    },
  };
}

function serverLog(message: string, serverId: string) {
  log(message, { id: serverId });
}
