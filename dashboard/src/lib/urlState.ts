// URL query-param sync for dashboard view state. Keeps "which process is
// selected" and "is the log panel collapsed" in the URL so a link or refresh
// restores the same view. Native URLSearchParams + history.replaceState — no
// router dependency, matching ws.ts's existing pattern.
//
// We only ever replace the URL (never push), so it doesn't add history entries
// for every selection. Updates are debounced-batch by always reading the live
// searchParams fresh before writing.

export const PROC_PARAM = "proc";
export const COLLAPSED_PARAM = "collapsed";

const COLLAPSED_TRUE = "1";

// Read `proc` and `collapsed` from the current URL on mount. Returns nulls when
// absent (the usual fresh-load case), letting the caller keep its defaults.
export function readUrlState(): {
  procId: string | null;
  collapsed: boolean;
} {
  if (typeof window === "undefined") return { procId: null, collapsed: false };
  const params = new URLSearchParams(window.location.search);
  return {
    procId: params.get(PROC_PARAM),
    collapsed: params.get(COLLAPSED_PARAM) === COLLAPSED_TRUE,
  };
}

// Merge a partial update into the live search params (preserving any unrelated
// params) and replace the URL in place. Deleting when empty keeps the URL clean.
export function writeUrlState(next: {
  procId?: string | null;
  collapsed?: boolean;
}): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  if (next.procId !== undefined) {
    if (next.procId) params.set(PROC_PARAM, next.procId);
    else params.delete(PROC_PARAM);
  }
  if (next.collapsed !== undefined) {
    if (next.collapsed) params.set(COLLAPSED_PARAM, COLLAPSED_TRUE);
    else params.delete(COLLAPSED_PARAM);
  }
  const qs = params.toString();
  const base = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
  const url = `${base}${window.location.hash}`;
  window.history.replaceState(null, "", url);
}
