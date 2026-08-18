import { execFile } from "child_process";

type ExecFileResult = { stdout: string; stderr: string };
type ExecFileExecutor = (
  file: string,
  args: string[],
  options: { encoding: "utf8"; windowsHide?: boolean },
) => Promise<ExecFileResult>;

const executeFile: ExecFileExecutor = (file, args, options) =>
  new Promise((resolve, reject) => {
    execFile(file, args, options, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });

// FolderBrowserDialog needs a topmost owner form, otherwise the dialog can
// open behind other windows when spawned from a background service process.
const windowsPickerScript = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Application]::EnableVisualStyles()
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = 'Select directory'
$owner = New-Object System.Windows.Forms.Form -Property @{
  TopMost = $true
  ShowInTaskbar = $false
  Opacity = 0
}
try {
  $owner.Show()
  $owner.Activate()
  if ($dialog.ShowDialog($owner) -ne [System.Windows.Forms.DialogResult]::OK) { 'UserCancelled' } else { $dialog.SelectedPath }
} finally {
  $dialog.Dispose()
  $owner.Dispose()
}
`;

export async function pickDirectory(
  executor: ExecFileExecutor = executeFile,
  platform: NodeJS.Platform = process.platform,
): Promise<string> {
  if (platform === "darwin") {
    try {
      const { stdout } = await executor(
        "osascript",
        ["-e", 'POSIX path of (choose folder with prompt "Select directory")'],
        { encoding: "utf8" },
      );
      return stdout.trim();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/-128|cancel/i.test(message)) return "UserCancelled";
      throw error;
    }
  }
  if (platform !== "win32") {
    throw new Error(`Directory picker is not supported on ${platform}`);
  }
  const { stdout } = await executor(
    "powershell.exe",
    ["-NoProfile", "-STA", "-Command", windowsPickerScript],
    { encoding: "utf8", windowsHide: false },
  );
  return stdout.trim();
}
