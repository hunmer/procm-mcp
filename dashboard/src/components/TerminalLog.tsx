import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/registry/default/lib/utils";
import { tokenizeAnsi, type AnsiSegment } from "./ansi";
import { JsonViewer, type JsonValue } from "./JsonViewer";
import type { LogEntry } from "@/lib/types";
import type { FontSize } from "./log-panel/types";
import {
  PreviewCard,
  PreviewCardPopup,
  PreviewCardTrigger,
} from "@/registry/default/ui/preview-card";

const URL_RE = /https?:\/\/[^\s<>"']+/gi;
const previewCache = new Map<string, LinkPreviewData | null>();

// Tools often style parts of a URL differently (e.g. host one color, port
// another), which splits the URL across ANSI segments — and per-segment link
// matching then drops the port (http://127.0.0.1 links, ":5173/…" renders as
// plain text). Match URLs while tolerating SGR escapes inside them, then
// strip those escapes so the whole URL lands in a single segment.
const URL_RE_WITH_ANSI = /https?:\/\/(?:\x1b\[[0-9;:]*m|[^\s<>"'\x1b])+/gi;
const SGR_RE = /\x1b\[[0-9;:]*m/g;

function joinAnsiSplitUrls(text: string): string {
  return text.replace(URL_RE_WITH_ANSI, (m) => m.replace(SGR_RE, ""));
}

type LinkPreviewData = {
  title?: string;
  description?: string;
  image?: string;
  logo?: string;
};

function cleanUrl(raw: string): string {
  return raw.replace(/[),.;!?]+$/, "");
}

function isLocalUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return (
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.startsWith("127.") ||
      hostname === "[::1]" ||
      hostname === "::1"
    );
  } catch {
    return false;
  }
}

function LinkPreview({ url }: { url: string }) {
  const [data, setData] = useState<LinkPreviewData | null | undefined>(() =>
    previewCache.has(url) ? previewCache.get(url) : undefined,
  );

  useEffect(() => {
    if (previewCache.has(url)) return;
    // Local development URLs are not reachable by Microlink and should not
    // leak to a third-party metadata service.
    if (isLocalUrl(url)) {
      previewCache.set(url, null);
      setData(null);
      return;
    }
    let cancelled = false;
    fetch(`https://api.microlink.io?url=${encodeURIComponent(url)}&meta=true`)
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        const next = payload?.data
          ? {
              title: payload.data.title,
              description: payload.data.description,
              image: payload.data.image?.url,
              logo: payload.data.logo?.url,
            }
          : null;
        previewCache.set(url, next);
        if (!cancelled) setData(next);
      })
      .catch(() => {
        previewCache.set(url, null);
        if (!cancelled) setData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  let hostname = url;
  try {
    hostname = new URL(url).hostname;
  } catch {
    // Keep the raw URL if it cannot be parsed.
  }
  const title = data?.title || hostname;
  return (
    <PreviewCardPopup className="w-[min(360px,calc(100vw-2rem))] p-0 overflow-hidden">
      {data?.image && (
        <img src={data.image} alt="" className="h-28 w-full object-cover" loading="lazy" />
      )}
      <div className="flex flex-col gap-1 p-3">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          {data?.logo && <img src={data.logo} alt="" className="h-4 w-4 rounded-sm" loading="lazy" />}
          <span className="truncate">{hostname}</span>
        </div>
        <p className="text-sm font-semibold leading-tight">{title}</p>
        {data?.description && <p className="line-clamp-3 text-xs text-muted-foreground">{data.description}</p>}
      </div>
    </PreviewCardPopup>
  );
}

function renderLinkedText(text: string, highlight: RegExp | null): ReactNode {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  URL_RE.lastIndex = 0;
  for (const match of text.matchAll(URL_RE)) {
    const raw = match[0];
    const url = cleanUrl(raw);
    const start = match.index ?? 0;
    if (start > cursor) nodes.push(highlightMatches(text.slice(cursor, start), highlight));
    nodes.push(
      <PreviewCard key={`${url}-${start}`}>
        <PreviewCardTrigger
          render={<a href={url} target="_blank" rel="noopener noreferrer" className="text-sky-300 underline decoration-sky-400/60 underline-offset-2 hover:text-sky-200" />}
        >
          {highlightMatches(url, highlight)}
        </PreviewCardTrigger>
        <LinkPreview url={url} />
      </PreviewCard>,
    );
    if (raw.length > url.length) nodes.push(raw.slice(url.length));
    cursor = start + raw.length;
  }
  if (cursor < text.length) nodes.push(highlightMatches(text.slice(cursor), highlight));
  return nodes.length ? <>{nodes}</> : highlightMatches(text, highlight);
}

// Log `data` payloads arrive as unknown (server-side JSON.parse output).
// Guard that the value is purely JSON-shaped before feeding the tree.
function isJsonValue(v: unknown): v is JsonValue {
  if (v === null) return true;
  switch (typeof v) {
    case "string":
    case "number":
    case "boolean":
      return true;
    case "object":
      return Object.values(v).every(isJsonValue);
    default:
      return false;
  }
}

function isFlatArray(value: unknown): value is Array<string | number | boolean | null> {
  return Array.isArray(value) && value.every(item =>
    item === null || ['string', 'number', 'boolean'].includes(typeof item)
  );
}

export { stripAnsi } from "./ansi";

// Wrap every match of `regex` inside `text` in a <mark>. Stateless (uses
// String.split so a global regex's lastIndex can't leak across renders) and
// re-inserts the captured delimiter so the mark shows the real matched text.
function highlightMatches(text: string, regex: RegExp | null): ReactNode {
  if (!regex || !text) return text;
  const parts = text.split(regex);
  const matches = text.match(regex);
  if (!matches || matches.length === 0) return text;
  const nodes: ReactNode[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (parts[i]) nodes.push(parts[i]);
    if (i < matches.length) {
      nodes.push(
        <mark
          key={i}
          // Black-on-yellow reads clearly over any ANSI color underneath.
          className="rounded-[2px] bg-yellow-300/70 px-0.5 text-black dark:bg-yellow-400/60"
        >
          {matches[i]}
        </mark>,
      );
    }
  }
  return <>{nodes}</>;
}

// Render one styled segment as a <span> with inline color/font styles derived
// from its ANSI attributes. `inverse` swaps fg/bg (defaulting to the terminal
// surface colors so e.g. `\x1b[7m` still inverts visibly).
function AnsiSpan({
  segment,
  highlight,
}: {
  segment: AnsiSegment;
  highlight: RegExp | null;
}) {
  const { style } = segment;
  const css: CSSProperties = {};
  if (style.inverse) {
    css.color = style.bg ?? "#e4e4e7";
    css.backgroundColor = style.fg ?? "#09090b";
  } else {
    if (style.fg) css.color = style.fg;
    if (style.bg) css.backgroundColor = style.bg;
  }
  if (style.bold) css.fontWeight = 700;
  if (style.dim) css.opacity = 0.5;
  if (style.italic) css.fontStyle = "italic";
  if (style.underline || style.strike) {
    css.textDecoration = [
      style.underline && "underline",
      style.strike && "line-through",
    ]
      .filter(Boolean)
      .join(" ");
  }
  return <span style={css}>{renderLinkedText(segment.text, highlight)}</span>;
}

// Render a string that may contain ANSI color/style codes. The (relatively
// expensive) tokenization is memoized per text so a changing search highlight
// doesn't re-parse every keystroke.
export function AnsiText({
  text,
  highlight,
}: {
  text: string;
  highlight: RegExp | null;
}) {
  const segments = useMemo<AnsiSegment[]>(() => tokenizeAnsi(joinAnsiSplitUrls(text)), [text]);
  return (
    <>
      {segments.map((seg, i) => (
        <AnsiSpan key={i} segment={seg} highlight={highlight} />
      ))}
    </>
  );
}

// One terminal log line: an optional (non-copyable) line-number badge, an
// optional timestamp, an `[stderr]` tag for the error stream, then the body.
// stderr lines that carry their own ANSI keep those colors; plain stderr is
// tinted red so it still stands out at a glance (matching the old behaviour).
function TerminalLine({
  entry,
  index,
  showTime,
  showLineNumbers,
  showJson,
  formatTime,
  highlight,
  backgroundMode = "none",
}: {
  entry: LogEntry;
  index: number;
  showTime: boolean;
  showLineNumbers: boolean;
  showJson: boolean;
  formatTime: (ts: number) => string;
  highlight: RegExp | null;
  backgroundMode?: "none" | "level" | "client";
}) {
  const isErr = entry.stream === "stderr";
  const hasAnsi = entry.message.includes("\u001b");
  const plainErr = isErr && !hasAnsi;
  const lineBackground = backgroundColor(entry, backgroundMode);
  return (
    <div className="min-w-0 whitespace-pre-wrap break-words" style={{ backgroundColor: lineBackground }}>
      {showLineNumbers && (
        // Non-copyable (user-select: none) so selecting log text doesn't drag
        // the numbers along.
        <span className="select-none mr-2 font-mono tabular-nums text-zinc-700">
          {String(index + 1).padStart(3, " ")}
        </span>
      )}
      {showTime && (
        <span className="text-zinc-600">
          [{formatTime(entry.timestamp)}]{" "}
        </span>
      )}
      {isErr && <span className="text-amber-400/90">[stderr] </span>}
      {entry.clientName && (
        <span className="mr-1" style={{ color: deviceColor(entry.clientName) }}>[{entry.clientName}] </span>
      )}
      {entry.level && (
        <span className={cn(
          "mr-1 uppercase",
          entry.level === "error" && "text-red-400",
          entry.level === "warn" && "text-amber-400",
          entry.level === "info" && "text-sky-400",
          entry.level === "debug" && "text-zinc-500",
        )}>[{entry.level}]</span>
      )}
      {plainErr ? (
        <span className="text-red-300">{entry.message}</span>
      ) : (
        <AnsiText text={entry.message} highlight={highlight} />
      )}
      {isFlatArray(entry.data) && (
        <span className="ml-2 text-zinc-300">
          {entry.data.map(item => String(item)).join(" ")}
        </span>
      )}
      {isJsonValue(entry.data) &&
        !isFlatArray(entry.data) &&
        (showJson ? (
          <div className="my-1 ml-4 max-w-full overflow-x-auto border-l border-zinc-700 pl-1">
            <JsonViewer data={entry.data} rootName="data" defaultExpanded={true} mini backgroundColor={lineBackground} />
          </div>
        ) : (
          <details className="ml-4 mt-0.5 text-zinc-400">
            <summary className="cursor-pointer select-none text-[11px] text-zinc-500">JSON</summary>
            <div className="my-1 max-w-full overflow-x-auto border-l border-zinc-700 pl-1">
              <JsonViewer data={entry.data} rootName="data" defaultExpanded={1} mini backgroundColor={lineBackground} />
            </div>
          </details>
        ))}
    </div>
  );
}

// Stable per-client color (used for the [clientName] tag, the client
// background tint and the device-filter badge dot).
export function deviceColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  const palette = ["#f59e0b", "#22d3ee", "#a78bfa", "#4ade80", "#fb7185", "#60a5fa", "#facc15", "#c084fc"];
  return palette[Math.abs(hash) % palette.length];
}

function backgroundColor(entry: LogEntry, mode: "none" | "level" | "client"): string | undefined {
  if (mode === "client" && entry.clientName) return `${deviceColor(entry.clientName)}22`;
  if (mode !== "level" || !entry.level) return undefined;
  const colors: Record<string, string> = { debug: "#71717a22", info: "#38bdf822", warn: "#f59e0b22", error: "#ef444422" };
  return colors[entry.level];
}

export interface TerminalLogProps {
  entries: LogEntry[];
  showTime: boolean;
  showLineNumbers: boolean;
  // Whether the structured `data` payload of an entry renders always
  // expanded; when off it stays collapsed behind a <details> toggle.
  // Toggled from the LogPanel view settings.
  showJson: boolean;
  formatTime: (ts: number) => string;
  highlight: RegExp | null;
  className?: string;
  backgroundMode?: "none" | "level" | "client";
  // Current font-size step. Ctrl/Cmd+wheel over the log zooms one step at a
  // time and reports the new value through onFontSizeChange so the caller
  // can persist it (the view-settings popover's fontSize state).
  fontSize?: FontSize;
  onFontSizeChange?: (size: FontSize) => void;
}

// Zoom ladder shared with the view-settings popover (xs→sm→md maps to
// text-xs / text-sm / text-base).
const FONT_STEPS: readonly FontSize[] = ["xs", "sm", "md"];

// Terminal-styled log body: renders the merged stdout/stderr entries inside a
// single <pre> (one line per entry), preserving whitespace and ANSI colors.
// Intended to sit on a dark terminal surface so the ANSI palette renders with
// the contrast its authors intended.
export function TerminalLog({
  entries,
  showTime,
  showLineNumbers,
  showJson,
  formatTime,
  highlight,
  className,
  backgroundMode = "none",
  fontSize,
  onFontSizeChange,
}: TerminalLogProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !onFontSizeChange) return;
    // Registered as a native non-passive listener: React attaches wheel
    // passively, so preventDefault (needed to stop the browser's Ctrl+wheel
    // page zoom) would be ignored in a synthetic onWheel handler.
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const idx = FONT_STEPS.indexOf(fontSize ?? "xs");
      const next =
        e.deltaY < 0
          ? Math.min(idx + 1, FONT_STEPS.length - 1)
          : Math.max(idx - 1, 0);
      if (next !== idx) onFontSizeChange(FONT_STEPS[next]);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [fontSize, onFontSizeChange]);
  return (
    <div ref={containerRef} className={cn("m-0 font-mono", className)}>
      {entries.map((entry, i) => (
        <TerminalLine
          key={i}
          entry={entry}
          index={i}
          showTime={showTime}
          showLineNumbers={showLineNumbers}
          showJson={showJson}
          formatTime={formatTime}
          highlight={highlight}
          backgroundMode={backgroundMode}
        />
      ))}
    </div>
  );
}
