import { execFileSync } from "child_process";
import { createRequire } from "module";

let folderDialog: (() => string) | null = null;

export function pickDirectory(): string {
  if (process.platform === "darwin") {
    try {
      return execFileSync("osascript", ["-e", 'POSIX path of (choose folder with prompt "Select directory")']).toString().trim();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/-128|cancel/i.test(message)) return "UserCancelled";
      throw error;
    }
  }
  folderDialog ??= createRequire(import.meta.url)("native-file-dialog") as { folder_dialog: () => string }["folder_dialog"];
  return folderDialog();
}
