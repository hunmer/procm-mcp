import { execFileSync } from "child_process";

// FolderBrowserDialog needs a topmost owner form, otherwise the dialog can
// open behind other windows when spawned from a background service process.
const windowsPickerScript = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = 'Select directory'
$owner = New-Object System.Windows.Forms.Form -Property @{ TopMost = $true }
if ($dialog.ShowDialog($owner) -ne [System.Windows.Forms.DialogResult]::OK) { 'UserCancelled' } else { $dialog.SelectedPath }
`;

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
  if (process.platform !== "win32") {
    throw new Error(`Directory picker is not supported on ${process.platform}`);
  }
  return execFileSync("powershell.exe", ["-NoProfile", "-STA", "-Command", windowsPickerScript], {
    encoding: "utf8",
    windowsHide: true,
  }).trim();
}
