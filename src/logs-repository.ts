import sqlite3 from "sqlite3";

export type LogRecord = {
  timestamp: number;
  message: string;
};

export type LogsRepository = {
  initialize: () => Promise<void>;
  insert: (record: LogRecord) => Promise<void>;
  top: (count: number) => Promise<LogRecord[]>;
  close: () => Promise<void>;
};

export async function createLogsRepository(
  filePath: string
): Promise<LogsRepository> {
  const db = await new Promise<sqlite3.Database>((resolve, reject) => {
    const db = new sqlite3.Database(filePath, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve(db);
      }
    });
  });

  return {
    initialize: () => initialize(db),
    insert: (record: LogRecord) => insert(db, record),
    top: (count: number) => top(db, count),
    close: () => close(db),
  };
}

function initialize(db: sqlite3.Database): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    db.run(
      "CREATE TABLE IF NOT EXISTS logs (timestamp INTEGER, message TEXT)",
      (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      }
    );
  });
}

function insert(db: sqlite3.Database, record: LogRecord): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    db.run(
      "INSERT INTO logs (timestamp, message) VALUES (?, ?)",
      [record.timestamp, record.message],
      (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      }
    );
  });
}

function top(db: sqlite3.Database, count: number): Promise<LogRecord[]> {
  return new Promise<LogRecord[]>((resolve, reject) => {
    db.all<LogRecord>(
      "SELECT timestamp, message FROM logs ORDER BY timestamp DESC LIMIT ?",
      [count],
      (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      }
    );
  });
}

function close(db: sqlite3.Database): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    db.close((err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}
