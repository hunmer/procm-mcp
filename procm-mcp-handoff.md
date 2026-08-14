# procm-mcp Handoff

## Current State

The room communication architecture is implemented in `G:/procm-mcp` and remains uncommitted in a dirty worktree. No procm-mcp backend is currently running; the managed development process was intentionally stopped.

Implemented surfaces:

- Publishable TypeScript SDK at `packages/procm-sdk` with reconnecting room WebSocket client, exact/prefix subscriptions, retained messages, `waitFor`, member events, and structured `Logger`.
- `/room` WebSocket broker, persisted room metadata, active members, process associations, and retained in-memory state.
- Optional process `roomId`, restart preservation, and injected SDK environment variables.
- `batch-process`, `room`, and `room-logs` MCP tools plus room HTTP endpoints.
- Structured log parsing/merging and Dashboard level/JSON rendering.
- Node and Electron demos under `demo/`; Electron uses pnpm. Both demos default to room `room-demo` and `ws://127.0.0.1:7331/room` through `.env.defaults`.
- SDK helper commands: `npm run link:sdk` and `npm run publish:sdk`. These scripts were created but intentionally not executed.
- Agent skill at `agent/skills/procm-rooms` with linked Markdown examples.

## Read First

- Implementation plan and decisions: `G:/procm-mcp/task_plan.md`
- Architecture findings: `G:/procm-mcp/findings.md`
- Work/verification record: `G:/procm-mcp/progress.md`
- Room usage skill: `G:/procm-mcp/agent/skills/procm-rooms/SKILL.md`
- Example index: `G:/procm-mcp/agent/skills/procm-rooms/examples/index.md`
- User-facing overview: `G:/procm-mcp/README.md`

## Key Entry Points

- SDK: `packages/procm-sdk/src/{protocol,client,logger}.ts`
- Broker/runtime: `src/room-hub.ts`, `src/websocket-server.ts`
- Metadata/logs: `src/room-repository.ts`, `src/room-logs.ts`
- Process integration: `src/process-manager.ts`, `src/tools/process.ts`
- Room tools: `src/tools/room.ts`
- Dashboard logs: `dashboard/src/components/LogPanel.tsx`, `TerminalLog.tsx`
- Demos: `demo/node-server`, `demo/electron-client`

## Verification

- Full repository test result: 6 suites, 97 assertions, 0 failures.
- SDK and root `npm pack --dry-run` checks passed.
- Electron v37.10.3 and demo script syntax were verified.
- `agent/skills/procm-rooms` passed the official skill validator and all local Markdown links resolve.
- After the latest demo default-environment change, targeted env loading was verified; a new full test run was not required.

Common commands:

```powershell
npm test
npm run build:sdk
npm --prefix "demo/node-server" start
pnpm --dir "demo/electron-client" start
```

Start a backend before running demos:

```powershell
node "build/index.js" --server --port 7331
```

## Suggested Skills

- `$procm-rooms` (`G:/procm-mcp/agent/skills/procm-rooms/SKILL.md`) for SDK, room, logging, batch, and Electron integration work.
- `$diagnose` for reported runtime or test failures.
- `$coss` and `$coss-particles` for Dashboard UI changes.
- `$planning-with-files` for work spanning multiple architecture areas.
- `$skill-creator` when updating the room skill or its agent metadata.

## Working Preferences

- Follow the repository AGENTS.md instructions and respond in Simplified Chinese.
- Use CodeGraph before raw search for architecture/code queries.
- Keep changes minimal and preserve unrelated dirty-worktree changes.
- Use pnpm for the Electron demo.
- Use procm-mcp to enable or restart persistent services after runtime code changes.
