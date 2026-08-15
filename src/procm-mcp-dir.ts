import { homedir } from "os";
import path from "path";

export function ProcmMcpDir() {
  return process.env.PROCM_MCP_DIR || process.cwd();
}

export function ProcmGlobalDir() {
  return path.join(homedir(), ".procm-mcp");
}
