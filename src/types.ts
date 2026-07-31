import { ChildProcess } from "child_process";
import { ProcessStdoutClient } from "./process-stdout-client.js";

export type ProcessStatus = "spawning" | "running" | "exited" | "error";

export type ProcessMetadata = {
  id: string;
  pid: number | undefined;
  name: string;
  script: string;
  args: string[];
  cwd: string;
  envs: Record<string, string>;
  status: ProcessStatus;
  error: string | null;
  exitCode: number | null;
  // Optional human-readable description, carried through from the caller
  // (MCP tool arg / dashboard form) and persisted alongside the record.
  desc: string | null;
  process: ChildProcess;
  stdoutClient: ProcessStdoutClient;
  stderrClient: ProcessStdoutClient;
};
