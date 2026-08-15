import { useMemo } from "react";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/registry/default/lib/utils";
import { tokenizeAnsi, type AnsiSegment } from "./ansi";
import { JsonViewer, type JsonValue } from "./JsonViewer";
import type { LogEntry } from "@/lib/types";

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
  return <span style={css}>{highlightMatches(segment.text, highlight)}</span>;
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
  const segments = useMemo<AnsiSegment[]>(() => tokenizeAnsi(text), [text]);
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
}: {
  entry: LogEntry;
  index: number;
  showTime: boolean;
  showLineNumbers: boolean;
  showJson: boolean;
  formatTime: (ts: number) => string;
  highlight: RegExp | null;
}) {
  const isErr = entry.stream === "stderr";
  const hasAnsi = entry.message.includes("\u001b");
  const plainErr = isErr && !hasAnsi;
  return (
    <div className="min-w-0 whitespace-pre-wrap break-words">
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
      {isJsonValue(entry.data) &&
        (showJson ? (
          <div className="my-1 ml-4 max-w-full overflow-x-auto border-l border-zinc-700 pl-1">
            <JsonViewer data={entry.data} rootName="data" defaultExpanded={true} mini />
          </div>
        ) : (
          <details className="ml-4 mt-0.5 text-zinc-400">
            <summary className="cursor-pointer select-none text-[11px] text-zinc-500">JSON</summary>
            <div className="my-1 max-w-full overflow-x-auto border-l border-zinc-700 pl-1">
              <JsonViewer data={entry.data} rootName="data" defaultExpanded={1} mini />
            </div>
          </details>
        ))}
    </div>
  );
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
}

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
}: TerminalLogProps) {
  return (
    <div className={cn("m-0 font-mono", className)}>
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
        />
      ))}
    </div>
  );
}
