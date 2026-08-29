import { killSystemProcess } from "@hunmer/procm-mcp-sdk";
import { assert, assertEqual, runTest, summarize } from "./_helpers.mjs";

const originalFetch = globalThis.fetch;

await runTest("killSystemProcess preserves tree-kill default and supports pid-only kill", async () => {
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url, init });
    return new Response(JSON.stringify({ ok: true, pid: 42 }), { status: 200 });
  };

  const client = {
    connectionTarget: {
      url: "ws://127.0.0.1:7331/room",
      token: "test-token",
    },
  };

  try {
    const defaultResult = await killSystemProcess(client, 42);
    await killSystemProcess(client, 43, true);
    await killSystemProcess(client, 44, false);

    assertEqual(defaultResult, undefined, "kill resolves without exposing the HTTP payload");
    assertEqual(requests[0].url, "http://127.0.0.1:7331/api/system-processes/42/kill", "default omits the tree query");
    assertEqual(requests[1].url, "http://127.0.0.1:7331/api/system-processes/43/kill", "tree=true keeps the default URL");
    assertEqual(requests[2].url, "http://127.0.0.1:7331/api/system-processes/44/kill?tree=0", "tree=false requests pid-only termination");
    assert(requests.every(({ init }) => init.method === "POST"), "all kill requests use POST");
    assert(requests.every(({ init }) => init.headers.Authorization === "Bearer test-token"), "all kill requests preserve authorization");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

summarize();
