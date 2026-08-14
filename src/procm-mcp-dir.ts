import { tmpdir } from "os";
import path from "path";

export function ProcmMcpDir() {
  return process.env.PROCM_MCP_DIR || path.join(tmpdir(), "procm-mcp");
}
