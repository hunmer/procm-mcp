import { createProcmClient, executeCustom } from "@procm-mcp/sdk";
import {
  assert,
  assertEqual,
  http,
  projectRoot,
  randomPort,
  runTest,
  sleep,
  startBackend,
  stopBackend,
  summarize,
} from "./_helpers.mjs";

function waitOpen(client, timeout = 5000) {
  if (client.connectionState === "open") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("test SDK connection timeout")), timeout);
    const off = client.onState((state) => {
      if (state !== "open") return;
      clearTimeout(timer);
      off();
      resolve();
    });
  });
}

async function retryCall(fn, attempts = 30) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      await sleep(100);
    }
  }
  throw lastError;
}

await runTest("noisy persistent processes keep custom execution responses clean", async () => {
  const port = randomPort();
  const backend = await startBackend({ port });
  const roomId = `noisy-execution-${Date.now()}`;
  const requester = createProcmClient({
    url: `ws://127.0.0.1:${port}/room`,
    roomId,
    clientName: "noisy-test-requester",
    reconnect: false,
  });
  const processIds = [];

  try {
    await waitOpen(requester);
    for (const [name, fixture] of [
      ["noisy-alpha", "tests/fixtures/noisy-alpha.mjs"],
      ["noisy-beta", "tests/fixtures/noisy-beta.mjs"],
    ]) {
      const started = await http(port, "POST", "/api/processes", {
        script: "node",
        args: [fixture],
        cwd: projectRoot,
        name,
        roomId,
      });
      assertEqual(started.status, 201, `${name} starts`);
      processIds.push(started.data.id);
    }

    const alpha = await retryCall(() => executeCustom(
      requester,
      "noisy-alpha",
      (context, left, right) => context.add(left, right),
      [19, 23],
    ));
    assertEqual(alpha.target, "noisy-alpha", "alpha response identifies its target");
    assertEqual(alpha.result, 42, "alpha response returns the computed value");
    assertEqual(alpha.noise, false, "alpha response contains no noise");

    const beta = await retryCall(() => executeCustom(
      requester,
      "noisy-beta",
      (context, value) => context.decorate(value),
      ["signal"],
    ));
    assertEqual(beta.target, "noisy-beta", "beta response identifies its target");
    assertEqual(beta.result, "beta:signal", "beta response returns the computed value");
    assertEqual(beta.noise, false, "beta response contains no noise");

    await sleep(250);
    const logs = await Promise.all(processIds.map((id) => http(
      port,
      "GET",
      `/api/processes/${id}/logs?stream=stdout&grep=NOISE&count=20`,
    )));
    assert(logs.every((result) => result.status === 200 && result.data.text.includes("NOISE")), "both processes produced stdout noise");
  } finally {
    for (const id of processIds) {
      const stopped = await http(port, "POST", `/api/processes/${id}/stop`, {}).catch(() => null);
      if (stopped) assert([200, 404].includes(stopped.status), `process ${id} stops cleanly`);
    }
    requester.close();
    stopBackend(backend);
  }
});

summarize();
