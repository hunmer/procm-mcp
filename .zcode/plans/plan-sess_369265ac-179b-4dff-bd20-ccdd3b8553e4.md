## Goal
When a search is active AND returns results in the LogPanel, show a **context-lines slider** that controls how many lines *after* each match are also displayed, and **highlight the matched keyword** in every displayed line.

## Design decisions
- **Context = after-lines only** (the user's wording: "搜索返回行数后面的几行消息"). Slider range 0–10, default 0 (current behavior). Before-context is intentionally omitted to keep scope tight and the `recent[]` array is newest-first anyway.
- **Slider**: coss Slider component (user-approved). Source already retrieved — will create `dashboard/src/registry/default/ui/slider.tsx` verbatim (no new deps; `@base-ui/react` already installed).
- **Highlight**: client-side. The `activeGrep` is already a regex; I'll render matches through a small highlighter that splits the message on matches and wraps them in a `<mark>`. Regex compilation is shared/cached via `useMemo`. Literal-fallback (invalid regex) handled by escaping the term.
- **Backend change is NOT required**: context lines can be computed client-side because the existing grep already returns matched lines from the in-memory `recent[]` buffer, but that buffer is NOT exposed to the client — only matched lines are. So context lines **do** require a backend extension. I'll add an `after` query param.

## Changes

### 1. Backend — `src/process-stdout-client.ts`
Extend `search()` signature to accept an `after` context count:
```ts
search: (pattern, count?, after?) => Promise<ProcessStdoutChunk[]>
```
Implementation: after computing matched indices in the (chronological) `recent[]` array, expand the result set to include up to `after` trailing entries following each match, dedup adjacent expansions to avoid blowing past `count * (after+1)` unboundedly. Cap total returned at `count + count*after`. Return merged list (matches + their after-context), preserving chronological order.

### 2. Backend — `src/http-server.ts`
- **Live path** (line ~599-614): read `after` query param (`Number(url.searchParams.get("after") || "0")`), pass to `client.search(regex, count, after)`.
- **Record path** (`grepLogFile`, line 321-346): add `after` param. After collecting matched line indices in `fullText.split("\n")`, include up to `after` following lines per match (deduped), within the count budget. Propagate `after` through `readRecordLogText`.

### 3. Frontend — `dashboard/src/lib/api.ts`
- `grepLogs()`: add `after = 0` param, append `&after=${after}` to the query string.
- `grepMergedLogs()`: add `after = 0` param, thread through to both `grepLogs` calls.

### 4. Frontend — `dashboard/src/registry/default/ui/slider.tsx` (NEW)
Create verbatim from the coss registry source (retrieved above). Exports `Slider`, `SliderValue`, `SliderPrimitive`.

### 5. Frontend — `dashboard/src/components/LogPanel.tsx`
- **New state**: `const [afterContext, setAfterContext] = useState(0);`
- **Debounce re-search on slider change**: extend the search effect's dependency array to include `afterContext` so moving the slider re-greps with the new context. Thread `afterContext` into the `grepMergedLogs` call. Reset `afterContext` to 0 when the process changes (in the load effect) alongside the existing `setSearch("")`.
- **Slider UI** (shown only when `activeGrep !== "" && !searching && entries.length > 0`): place it in a slim row directly **below the search input** (after the closing `</div>` of the search box at line 623, before the quick-filters row at line 627). Layout:
  ```
  <div className="flex items-center gap-2 px-0.5">
    <span className="text-muted-foreground text-xs whitespace-nowrap">{t("logs.contextAfter")}</span>
    <Slider value={afterContext} onValueChange={(v)=>setAfterContext(Number(v))} min={0} max={10} className="flex-1" aria-label={t("logs.contextAfter")} />
    <span className="text-muted-foreground text-xs tabular-nums w-6 text-right">{afterContext}</span>
  </div>
  ```
- **Highlight**: import a small `Highlighted` helper. Update the `Line` component to accept an optional `highlight?: RegExp | null` prop. When set, render `entry.message` via the highlighter (split on `highlight`, wrap matches in `<mark className="bg-yellow-300/40 rounded-sm px-0.5">`). Pass `highlight={highlightRegex}` from the render loop only when `activeGrep` is set. Compute `highlightRegex` with `useMemo` from `activeGrep` (compile with same try/catch; on invalid regex, fall back to escaped-literal RegExp).
- **Copy-text alignment**: `handleCopyText` already maps `entry.message` — no change needed (highlight is visual only, copied text stays plain).

### 6. i18n — `dashboard/src/locales/en.json` + `zh.json`
Add one key under `logs`:
- en: `"contextAfter": "Context after"`
- zh: `"contextAfter": "后续行数"`

## Verification
1. `npm run -w dashboard build` (or `tsc`) — typecheck passes, no missing import.
2. Manual: open a process with logs, type a search term that matches → slider appears; drag to 3 → 3 trailing lines appear after each match; matched keyword is highlighted in all displayed lines; clear search → slider hides, live tail resumes; switching process resets slider to 0.
3. Test against a **stopped** process too (record path via `grepLogFile`) to confirm both backend paths honor `after`.

## Out of scope
- Before-context lines, multi-term highlighting, per-match collapse/expand, persisting the slider value across processes.