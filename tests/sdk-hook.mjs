import { createHook, hookProperty } from "@procm-mcp/sdk";
import { assert, assertEqual, runTest, summarize } from "./_helpers.mjs";
import { invokeFirst } from "./fixtures/hook-target.mjs";

await runTest("function hooks preserve sync, this, ordering, mutation, and skip semantics", () => {
  const calls = [];
  const owner = {
    factor: 3,
    multiply(value) { calls.push("original"); return value * this.factor; },
  };
  owner.multiply = createHook(owner.multiply)
    .before((context) => { calls.push("before-1"); context.setArgs([context.args[0] + 1]); })
    .before(() => calls.push("before-2"))
    .after((context) => { calls.push("after-1"); context.setResult(context.result + 2); })
    .after((context) => { calls.push("after-2"); context.setResult(context.result * 2); });
  const result = owner.multiply(2);
  assert(!(result instanceof Promise), "sync hook remains synchronous");
  assertEqual(result, 22, "before and after handlers modify values in order");
  assertEqual(calls.join(","), "before-1,before-2,original,after-1,after-2", "handler ordering is stable");

  let ran = false;
  const skipped = createHook(() => { ran = true; return 1; })
    .before((context) => context.skip(8))
    .after((context) => context.setResult(context.result + 1));
  assertEqual(skipped(), 9, "skip result still passes through after handlers");
  assertEqual(ran, false, "skip does not call original function");
});

await runTest("throw/reject identity and Promise results are preserved", async () => {
  const syncError = new TypeError("sync failure");
  let seenSync;
  const throws = createHook(() => { throw syncError; }).after(({ error }) => { seenSync = error; });
  try { throws(); } catch (error) { assert(error === syncError, "caller receives identical sync error"); }
  assert(seenSync === syncError, "after receives identical sync error");

  const rejectError = new Error("async failure");
  let seenReject;
  const rejects = createHook(async () => { throw rejectError; }).after(({ error }) => { seenReject = error; });
  try { await rejects(); } catch (error) { assert(error === rejectError, "caller receives identical rejection"); }
  assert(seenReject === rejectError, "after receives identical rejection");

  const resolves = createHook(async (value) => value + 1).after((context) => context.setResult(context.result * 2));
  const promise = resolves(4);
  assert(promise instanceof Promise, "async hook returns a Promise");
  assertEqual(await promise, 10, "after can modify resolved value");
});

await runTest("handlers must be synchronous and call chain has runtime locations", () => {
  const invalid = createHook((value) => value).before(async () => {});
  let message = "";
  try { invalid(1); } catch (error) { message = error.message; }
  assert(message.includes("must be synchronous"), "Promise-returning before handler fails clearly");

  let chain;
  const hooked = createHook((value) => value, { onTraceCreated() {} }).before(({ callChain }) => { chain = callChain; });
  assertEqual(invokeFirst(hooked, 5), 5, "fixture invocation succeeds");
  const names = chain.map((frame) => frame.functionName);
  assert(names.includes("invokeFirst") && names.includes("invokeSecond") && names.includes("invokeThird"), "call chain contains three fixture functions");
  assert(chain.every((frame) => typeof frame.file === "string" && frame.line === null || frame.line > 0), "call chain locations are valid");
  assert(chain.every((frame) => !frame.file.endsWith("hook.js")), "internal hook frames are filtered");
});

await runTest("capture is opt-in and unsafe JSON values do not change results", () => {
  let traceId;
  const circular = {};
  circular.self = circular;
  const client = undefined;
  const plain = createHook(() => circular, { client, onTraceCreated: (id) => { traceId = id; } });
  assert(plain() === circular, "circular result identity remains unchanged");
  assert(typeof traceId === "string" && traceId.length > 0, "trace ID is created before invocation");
  const bigint = createHook((value) => value, { captureArgs: true, captureResult: true });
  assert(bigint(1n) === 1n, "BigInt capture failure does not alter result");
});

await runTest("property hooks preserve behavior and restore descriptors idempotently", () => {
  const target = { value: 1 };
  const before = Object.getOwnPropertyDescriptor(target, "value");
  const restore = hookProperty(target, "value");
  target.value = 7;
  assertEqual(target.value, 7, "hooked data property supports get and set");
  restore();
  restore();
  const after = Object.getOwnPropertyDescriptor(target, "value");
  assertEqual(after.value, 7, "restore keeps current property value");
  assertEqual(after.writable, before.writable, "restore keeps writable flag");
  assertEqual(after.enumerable, before.enumerable, "restore keeps enumerable flag");

  let failures = 0;
  for (const [object, key] of [[{}, "missing"], [Object.create({ inherited: 1 }), "inherited"]]) {
    try { hookProperty(object, key); } catch { failures++; }
  }
  const fixed = {};
  Object.defineProperty(fixed, "value", { value: 1, configurable: false });
  try { hookProperty(fixed, "value"); } catch { failures++; }
  assertEqual(failures, 3, "missing, inherited, and non-configurable properties fail");
});

summarize();
