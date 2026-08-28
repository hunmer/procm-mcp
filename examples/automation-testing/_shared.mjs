import {
  http,
  projectRoot,
  sleep,
} from "../../tests/_helpers.mjs";

export { projectRoot, sleep };

export function createReporter(title, total) {
  let completed = 0;
  console.log(`\n=== ${title} ===`);

  return {
    pass(label, detail) {
      completed += 1;
      const suffix = detail === undefined ? "" : ` | ${formatDetail(detail)}`;
      console.log(`[${completed}/${total}] PASS ${label}${suffix}`);
    },
    fail(error) {
      console.error(`\nRESULT: FAIL | ${error instanceof Error ? error.message : String(error)}`);
    },
    done() {
      if (completed !== total) {
        throw new Error(`expected ${total} validation steps, completed ${completed}`);
      }
      console.log(`\nRESULT: PASS | ${completed}/${total} validation steps completed`);
    },
  };
}

export function assertExample(condition, message, detail) {
  if (!condition) {
    const suffix = detail === undefined ? "" : `: ${formatDetail(detail)}`;
    throw new Error(`${message}${suffix}`);
  }
}

export async function waitOpen(client, timeout = 5_000) {
  if (client.connectionState === "open") return;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      off();
      reject(new Error(`SDK connection timed out after ${timeout}ms`));
    }, timeout);
    const off = client.onState((state) => {
      if (state !== "open") return;
      clearTimeout(timer);
      off();
      resolve();
    });
  });
}

export async function startManagedProcess(port, input) {
  const response = await http(port, "POST", "/api/processes", input);
  assertExample(response.status === 201, `failed to start ${input.name}`, response.data);
  return response.data;
}

export async function deleteManagedProcess(port, id) {
  if (!id) return;
  const response = await http(port, "DELETE", `/api/processes/${id}`);
  assertExample([200, 404].includes(response.status), `failed to delete process ${id}`, response.data);
}

export async function printProcessDiagnostics(port, processIds) {
  for (const id of processIds.filter(Boolean)) {
    for (const stream of ["stdout", "stderr"]) {
      try {
        const response = await http(port, "GET", `/api/processes/${id}/logs?stream=${stream}&count=30`);
        const text = response.data?.text?.trim();
        if (text) console.error(`[DIAGNOSTIC] ${id} ${stream}\n${text}`);
      } catch (error) {
        console.error(`[DIAGNOSTIC] failed to read ${id} ${stream}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
}

export async function waitForValue(load, accept, options = {}) {
  const timeout = options.timeout ?? 5_000;
  const interval = options.interval ?? 100;
  const deadline = Date.now() + timeout;
  let lastValue;
  let lastError;

  while (Date.now() < deadline) {
    try {
      lastValue = await load();
      if (accept(lastValue)) return lastValue;
    } catch (error) {
      lastError = error;
    }
    await sleep(interval);
  }

  if (lastError) throw lastError;
  throw new Error(`condition timed out after ${timeout}ms; last value: ${formatDetail(lastValue)}`);
}

function formatDetail(value) {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
