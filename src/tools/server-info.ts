import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { textResult } from "../tool-helpers.js";
import { serverLog, serverId } from "../server-log.js";

export function registerServerInfoTools(server: McpServer) {
  server.tool("get-server-id", "Get server id", {}, async () => {
    serverLog("get-server-id tool called");
    return textResult(`Server ID: ${serverId}`);
  });
}
