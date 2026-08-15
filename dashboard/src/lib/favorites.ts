import { useCallback, useEffect, useState } from "react";
import type { ProcessView, StartProcessBody } from "./types";

// Favorites are a purely client-side concept: a saved "recipe" for starting a
// process (script + args + cwd + envs + desc) plus an optional category used
// to group them in the UI. They persist in localStorage and have nothing to do
// with the backend process records, so a favorite can be re-launched any time.

const STORAGE_KEY = "procm-favorites";

export interface Favorite {
  // Stable id (so toggling/edits/deletes are deterministic across reloads).
  id: string;
  // Optional human label. Falls back to script when absent.
  name?: string;
  // Optional longer description shown on the card.
  desc?: string;
  script: string;
  args: string[];
  cwd: string;
  envs?: Record<string, string>;
  // Optional port the process serves on, carried into the start call so a
  // relaunched favorite keeps its one-click open link.
  port?: number;
  // Optional grouping key. Empty string means "Uncategorized".
  category?: string;
  // Epoch ms — newest first in the UI.
  createdAt: number;
}

// Derive a favorite from a live process view: the envs aren't exposed by the
// public API by design, so a favorited process keeps only the launch fields.
export function favoriteFromProcess(p: ProcessView): Favorite {
  return {
    id: makeId(),
    name: p.name,
    desc: p.desc ?? undefined,
    script: p.script,
    args: p.args,
    cwd: p.cwd,
    port: typeof p.port === "number" ? p.port : undefined,
    category: "",
    createdAt: Date.now(),
  };
}

// A favorite is equivalent to a process view for *launch* purposes: same shape
// the start endpoint expects.
export function favoriteToStartBody(f: Favorite): StartProcessBody {
  return {
    name: f.name?.trim() || undefined,
    script: f.script.trim(),
    args: f.args,
    cwd: f.cwd.trim(),
    envs: f.envs,
    desc: f.desc?.trim() || undefined,
    port: f.port,
  };
}

// The grouping identity for the merged list's catch-all bucket: favorites
// without an explicit category and processes that match no favorite both land
// here. Kept as a stable English constant so Map keys / sort comparisons are
// locale-independent; it is translated only at the display site.
export const UNGROUPED = "Ungrouped";

// Normalized group label: blank/whitespace category collapses to "Ungrouped".
export function groupKeyOf(category: string | undefined): string {
  const v = (category ?? "").trim();
  return v.length ? v : UNGROUPED;
}

function makeId(): string {
  // crypto.randomUUID is available in all evergreen browsers and the dev/serve
  // contexts; fall back to a timestamp+random for safety.
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// Signature for "is this process already favorited?": we key on the launch
// fields (script + args + cwd) since name/desc may differ between runs but the
// thing being launched is the same.
export function favoriteSignature(f: {
  script: string;
  args: string[];
  cwd: string;
}): string {
  return `${f.script}\0${f.args.join(" ")}\0${f.cwd}`;
}

function read(): Favorite[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Be lenient on the way in: only keep objects with a script+cwd, and give
    // each a stable id if missing (e.g. entries saved before ids existed).
    return parsed
      .filter((f): f is Record<string, unknown> => typeof f === "object" && f !== null)
      .map((f) => normalize(f))
      .filter((f): f is Favorite => f != null);
  } catch {
    return [];
  }
}

function normalize(raw: Record<string, unknown>): Favorite | null {
  const script = typeof raw.script === "string" ? raw.script : "";
  const cwd = typeof raw.cwd === "string" ? raw.cwd : "";
  if (!script || !cwd) return null;
  const args = Array.isArray(raw.args)
    ? raw.args.filter((a): a is string => typeof a === "string")
    : [];
  const envs =
    raw.envs && typeof raw.envs === "object" && !Array.isArray(raw.envs)
      ? (raw.envs as Record<string, string>)
      : undefined;
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : makeId(),
    name: typeof raw.name === "string" && raw.name ? raw.name : undefined,
    desc: typeof raw.desc === "string" && raw.desc ? raw.desc : undefined,
    script,
    args,
    cwd,
    envs,
    port: typeof raw.port === "number" ? raw.port : undefined,
    category: typeof raw.category === "string" ? raw.category : "",
    createdAt: typeof raw.createdAt === "number" ? raw.createdAt : Date.now(),
  };
}

function write(favorites: Favorite[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
  } catch {
    // localStorage may be unavailable (private mode); ignore.
  }
}

// Hook: exposes the favorites list plus the mutations the UI needs. Persists
// to localStorage on every change, and keeps multiple hook instances (e.g.
// across re-mounts or tabs) in sync via the `storage` event.
export function useFavorites() {
  const [favorites, setFavorites] = useState<Favorite[]>(() => read());

  useEffect(() => {
    // Re-read when another tab/window mutates the same key.
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) setFavorites(read());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Add a favorite. No-op (returns false) if an identical launch signature is
  // already saved, so callers can tell whether the add actually happened.
  const addFavorite = useCallback(
    (fav: Favorite): boolean => {
      const sig = favoriteSignature(fav);
      let added = false;
      setFavorites((cur) => {
        if (cur.some((f) => favoriteSignature(f) === sig)) return cur;
        added = true;
        const next = [...cur, fav];
        write(next);
        return next;
      });
      return added;
    },
    [],
  );

  // Remove a favorite by id.
  const removeFavorite = useCallback((id: string) => {
    setFavorites((cur) => {
      const next = cur.filter((f) => f.id !== id);
      write(next);
      return next;
    });
  }, []);

  // Replace a favorite (edit) by id.
  const updateFavorite = useCallback((fav: Favorite) => {
    setFavorites((cur) => {
      const next = cur.map((f) => (f.id === fav.id ? fav : f));
      write(next);
      return next;
    });
  }, []);

  return {
    favorites,
    addFavorite,
    removeFavorite,
    updateFavorite,
  };
}

export function makeFavoriteId(): string {
  return makeId();
}
