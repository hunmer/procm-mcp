import { useEffect, useState } from "react";
import { detectCwd } from "./cwd";

// Shape of a "quick fill" preset. All fields are optional; applying a preset
// only overwrites the fields it defines, leaving the rest of the form alone.
export interface ProcessPreset {
  id: string;
  label: string;
  description: string;
  name?: string;
  script?: string;
  args?: string;
  envs?: string;
  // When omitted the preset keeps whatever working directory the user has
  // already entered (or the auto-detected default), since absolute paths are
  // machine-specific.
  cwd?: string;
}

// Resolve `${cwd}` placeholders in a preset against the detected/entered cwd,
// so demo scripts can point at the repo without a hardcoded absolute path.
function interpolate(p: ProcessPreset, cwd: string): ProcessPreset {
  if (!p.args || !p.args.includes("${cwd}")) return p;
  return { ...p, args: p.args.replace(/\$\{cwd\}/g, cwd) };
}

// Default demo scripts shipped with this repo. They are designed to visibly
// exercise the real-time log push (incrementing output, mixed streams, etc.).
function defaultPresets(repoCwd: string): ProcessPreset[] {
  return [
    {
      id: "counter",
      label: "Counter",
      description: "Incrementing counter on stdout every 1s",
      name: "counter",
      script: "node",
      args: `${repoCwd}/scripts/demo/counter.mjs`,
      cwd: repoCwd,
    },
    {
      id: "slow-log",
      label: "Mixed streams",
      description: "Alternates stdout/stderr every 1s",
      name: "slow-log",
      script: "node",
      args: `${repoCwd}/scripts/demo/slow-log.mjs`,
      cwd: repoCwd,
    },
    {
      id: "http-server",
      label: "HTTP server",
      description: "Tiny server logging each request",
      name: "http-server",
      script: "node",
      args: `${repoCwd}/scripts/demo/http-server.mjs`,
      cwd: repoCwd,
    },
    {
      id: "ping",
      label: "Ping loop",
      description: "System ping — long-lived, steady output",
      name: "ping",
      script: "ping",
      // Cross-platform arg shape (Windows needs -t to loop, POSIX loops by
      // default). The launcher's split-on-whitespace would mangle a host with
      // spaces, but 127.0.0.1 has none.
      args: "127.0.0.1",
      envs: "",
    },
    {
      id: "level-log",
      label: "Level logger",
      description: "SDK structured logs cycling levels; LOG_LEVEL controls output",
      name: "level-log",
      script: "node",
      args: `${repoCwd}/scripts/demo/level-log.mjs`,
      cwd: repoCwd,
      envs: "LOG_LEVEL=debug",
    },
  ];
}

// Hook: returns the preset list with ${cwd} resolved to the detected repo
// root (best-effort; falls back to the user-entered cwd when unknown).
export function useProcessPresets(): ProcessPreset[] {
  const [repoCwd, setRepoCwd] = useState("");
  useEffect(() => {
    detectCwd().then((c) => setRepoCwd(c));
  }, []);
  // Use a sensible placeholder until detection resolves so presets still apply
  // (the user can edit the cwd field afterwards).
  const cwd = repoCwd || ".";
  return defaultPresets(cwd).map((p) => interpolate(p, cwd));
}

// Apply a preset to a set of form setters, only touching defined fields.
export function applyPreset(
  preset: ProcessPreset,
  setters: {
    setName: (v: string) => void;
    setScript: (v: string) => void;
    setArgs: (v: string) => void;
    setCwd: (v: string) => void;
    setEnvs: (v: string) => void;
  },
) {
  if (preset.name !== undefined) setters.setName(preset.name);
  if (preset.script !== undefined) setters.setScript(preset.script);
  if (preset.args !== undefined) setters.setArgs(preset.args);
  if (preset.cwd !== undefined) setters.setCwd(preset.cwd);
  if (preset.envs !== undefined) setters.setEnvs(preset.envs);
}
