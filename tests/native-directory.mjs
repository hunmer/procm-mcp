import { pickDirectory } from "../build/native-directory.js";
import { assert, assertEqual, runTest, summarize, sleep } from "./_helpers.mjs";

await runTest("directory picker runs asynchronously on Windows", async () => {
  const isAsync = pickDirectory.constructor.name === "AsyncFunction";
  assert(isAsync, "pickDirectory is asynchronous");
  if (!isAsync) return;

  let invocation;
  let settled = false;
  const executor = async (file, args, options) => {
    invocation = { file, args, options };
    await sleep(20);
    return { stdout: "  C:\\workspace\r\n", stderr: "" };
  };

  const pending = pickDirectory(executor, "win32").then((result) => {
    settled = true;
    return result;
  });
  await sleep(0);

  assert(!settled, "picker wait does not synchronously block the event loop");
  assertEqual(await pending, "C:\\workspace", "selected path is trimmed");
  assertEqual(invocation.file, "powershell.exe", "uses Windows PowerShell");
  assert(invocation.args.includes("-STA"), "runs WinForms in an STA thread");
  assertEqual(invocation.options.windowsHide, false, "allows the native dialog to become visible");
  const script = invocation.args.at(-1);
  assert(script.includes("$owner.Show()"), "shows the topmost owner before opening the dialog");
  assert(script.includes("$owner.Activate()"), "activates the dialog owner");
  assert(script.includes("$owner.Dispose()"), "disposes the dialog owner");
});

summarize();
