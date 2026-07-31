// Best-effort detection of the backend's current working directory, used by
// the "start a process" presets to fill demo script paths without hardcoding
// an absolute path. Resolves to "" when unavailable — callers should fall
// back to a placeholder.

export async function detectCwd(): Promise<string> {
  try {
    const res = await fetch("/api/meta");
    if (!res.ok) return "";
    const data = (await res.json()) as { cwd?: string };
    return typeof data.cwd === "string" ? data.cwd : "";
  } catch {
    return "";
  }
}
