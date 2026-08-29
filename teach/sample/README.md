# procm-mcp debugging exercise

[简体中文](README.zh-CN.md)

This is a deliberately broken Node.js HTTP service for practicing the following loop:

1. Install and connect procm-mcp.
2. Initialize the project commands.
3. Start the service through procm-mcp.
4. Trigger the error in the page.
5. Have the Agent read the logs, add debugging output, and fix the issue.
6. Click the button again to verify the fix.

The sample uses only Node.js built-in modules and does not include the procm SDK. Do not fix the bug in `server.js` before starting the exercise.

## Requirements

- Node.js 18 or newer
- An AI coding Agent that supports MCP and project Skills

Run the following commands from this directory (`teach/sample`).

## 1. Install procm-mcp

Install procm-mcp in the exercise project:

```bash
npm install --global @hunmer/procm-mcp
```

Install the project initialization and process management Skills:

```bash
npx skills add hunmer/procm-mcp --skill procm-mcp procm-mcp-init -y
```

Register the service entry point as an MCP server using your Agent's MCP configuration format:

```json
{
  "mcpServers": {
    "procm-mcp": {
      "command": "procm-mcp",
      "env": {}
    }
  }
}
```

Reload the Agent and confirm that it can see the procm-mcp process and log tools.

## 2. Have the Agent initialize the project

Send this message to the Agent:

> Please initialize the procm-mcp commands for the current project. Read the startup script from package.json, show the proposal first, then create procm-commands.json. Do not start the service.

Confirm that the generated `procm-commands.json` includes a command that runs `npm start`.

## 3. Start the service through procm-mcp

Send this message to the Agent:

> Please start the current project's start command through procm-mcp, not directly in the terminal. After it starts, read the latest logs and tell me the process ID and URL.

The default URL is <http://127.0.0.1:3000>. Do not stop the Agent-managed service.

## 4. Trigger the error

1. Open <http://127.0.0.1:3000> in a browser.
2. Click **Calculate total**.
3. Confirm that the page shows the HTTP 500 error name, message, and stack trace.

## 5. Have the Agent read the evidence and fix it

Do not copy the page error or terminal logs. Send this message to the Agent:

> I clicked "Calculate total" and the page reported an error. Read the service's latest stdout and stderr to locate it. First add necessary debugging output at the key inputs and calculation, restart the service through procm-mcp, and ask me to click again to collect logs. Fix the root cause from the new logs, then restart through procm-mcp and check the startup logs. Do not add the procm SDK.

The Agent should obtain the error evidence from procm-mcp before changing the code. Click the button again when prompted so it can read the new debugging logs and complete the fix.

## 6. Verify the fix manually

1. Refresh <http://127.0.0.1:3000>.
2. Click **Calculate total** again.
3. Confirm that the response is `ok: true` and the total is `497`.
4. Tell the Agent: “I clicked and verified it successfully. Read the latest logs to confirm there are no new errors, then stop the service.”

After completing the exercise, you should have practiced the full procm-mcp workflow: managed startup, log inspection, restart, debug-log collection, fixing, and stopping the service.
