// allow-x gate on the MCP path:
//   - start-process is blocked until allow-start-process permits the exact script/args/cwd
//   - after allowing, the same combination starts
//   - a different (unallowed) combination is blocked
//   - --allow-all bypasses the gate
// These go over MCP stdio (the gate only exists in the MCP tools).
//
// NOTE: allow-x persists to disk (allowed-process-creations.json), so each test
// uses a UNIQUE args token to avoid cross-test / cross-run contamination.
import {
  mcpCalls,
  assert,
  assertEqual,
  runTest,
  summarize,
  projectRoot,
} from "./_helpers.mjs";

const cwd = projectRoot;
const script = "node";
// A unique token per run so we never reuse an allowed entry from a prior run.
const uniq = `probe-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

function text(result) {
  return result?.result?.content?.[0]?.text ?? "";
}

await runTest("start-process blocked before allow", async () => {
  const r = await mcpCalls([
    {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "start-process",
        arguments: { script, args: ["-e", uniq, "blocked"], cwd, name: "x" },
      },
    },
  ]);
  assert(text(r[1]).includes("not allowed"), "blocked message");
});

await runTest("allow then start succeeds (same args)", async () => {
  const allowedArgs = ["-e", uniq, "ok"];
  const r = await mcpCalls(
    [
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "allow-start-process", arguments: { script, args: allowedArgs, cwd } },
      },
      {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "start-process", arguments: { script, args: allowedArgs, cwd, name: "y" } },
      },
    ],
  );
  assert(text(r[1]).includes("allowed"), "allow acknowledged");
  assert(/Process started/.test(text(r[2])), "started after allow");
});

await runTest("different args still blocked", async () => {
  const r = await mcpCalls([
    {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "start-process",
        arguments: { script, args: ["-e", uniq, "different"], cwd, name: "z" },
      },
    },
  ]);
  assert(text(r[1]).includes("not allowed"), "mismatched args blocked");
});

await runTest("--allow-all bypasses the gate", async () => {
  const r = await mcpCalls(
    [
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "start-process",
          arguments: { script, args: ["-e", uniq, "never-allowed"], cwd, name: "w" },
        },
      },
    ],
    { allowAll: true },
  );
  assert(/Process started/.test(text(r[1])), "started via --allow-all");
});

summarize();
