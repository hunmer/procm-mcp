import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// Build a standard text CallToolResult. Replaces the repetitive
// `{ content: [{ type: "text", text }] }` literal scattered across tools.
export function textResult(text: string): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text,
      },
    ],
  };
}

export function notFoundResult(id: string): CallToolResult {
  return textResult(`Process with ID ${id} not found.`);
}
