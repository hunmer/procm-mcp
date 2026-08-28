// Interactive JSON tree viewer. Adapted from
// agent_spaces/packages/web/src/components/viewers/json-viewer.tsx for this
// dashboard: Base UI (coss registry) Popover/Dialog primitives, no shiki
// color themes (Tailwind palette only) and no HoverCard preview.
import * as React from "react";
import {
  Check,
  ChevronRight,
  Copy,
  CopyPlus,
  Search,
  UnfoldHorizontal,
  FoldHorizontal,
  X,
  Clipboard,
  ClipboardCopy,
  Maximize2,
} from "lucide-react";
import { cn } from "@/registry/default/lib/utils";
import {
  Popover,
  PopoverTrigger,
  PopoverPopup,
} from "@/registry/default/ui/popover";
import {
  Dialog,
  DialogPopup,
  DialogTitle,
} from "@/registry/default/ui/dialog";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

function typeOf(value: JsonValue): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function countEntries(value: JsonValue): number {
  if (Array.isArray(value)) return value.length;
  if (value !== null && typeof value === "object")
    return Object.keys(value).length;
  return 0;
}

function buildPath(parent: string, key: string | number): string {
  if (parent === "") return String(key);
  if (typeof key === "number") return `${parent}[${key}]`;
  if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)) return `${parent}.${key}`;
  return `${parent}["${key}"]`;
}

function matchesSearch(
  key: string | number,
  value: JsonValue,
  query: string,
): boolean {
  const q = query.toLowerCase();
  if (String(key).toLowerCase().includes(q)) return true;
  if (value === null) return "null".includes(q);
  if (typeof value !== "object") return String(value).toLowerCase().includes(q);
  return false;
}

function hasSearchMatch(
  value: JsonValue,
  key: string | number,
  query: string,
): boolean {
  if (!query) return false;
  if (matchesSearch(key, value, query)) return true;
  if (value !== null && typeof value === "object") {
    const entries = Array.isArray(value)
      ? value.map((v, i) => [i, v] as const)
      : Object.entries(value);
    return entries.some(([k, v]) => hasSearchMatch(v, k, query));
  }
  return false;
}

// Token color classes are dark: variants; embed the viewer inside a `dark`
// wrapper when the surrounding surface is always dark (e.g. the log panel).
function tokenClass(token: string): string {
  switch (token) {
    case "key":
      return "text-violet-400";
    case "string":
      return "text-emerald-400";
    case "number":
      return "text-sky-400";
    case "boolean":
      return "text-amber-400";
    case "null":
      return "text-zinc-500";
    default:
      return "text-zinc-400";
  }
}

function TokenSpan({
  token,
  children,
  className,
  italic,
}: {
  token: string;
  children: React.ReactNode;
  className?: string;
  italic?: boolean;
}) {
  return (
    <span className={cn(tokenClass(token), italic && "italic", className)}>
      {children}
    </span>
  );
}

function HighlightMatch({
  text,
  query,
}: {
  text: string;
  query: string;
}) {
  if (!query) return <>{text}</>;

  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;

  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-sm bg-amber-400/30 px-0.5 text-inherit">
        {text.slice(idx, idx + query.length)}
      </mark>
    </>
  );
}

interface JsonNodeProps {
  keyName: string | number;
  value: JsonValue;
  path: string;
  depth: number;
  defaultExpanded: number | true;
  searchQuery: string;
  collapsedPaths: Set<string>;
  onToggle: (path: string) => void;
  isLast: boolean;
}

function JsonNode({
  keyName,
  value,
  path,
  depth,
  defaultExpanded,
  searchQuery,
  collapsedPaths,
  onToggle,
  isLast,
}: JsonNodeProps) {
  const type = typeOf(value);
  const isExpandable = type === "object" || type === "array";
  const count = isExpandable ? countEntries(value) : 0;

  const isCollapsed = collapsedPaths.has(path);
  const isExpanded = isExpandable && !isCollapsed;

  const openBracket = type === "array" ? "[" : "{";
  const closeBracket = type === "array" ? "]" : "}";
  const comma = isLast ? "" : ",";

  const nodeMatches = searchQuery && matchesSearch(keyName, value, searchQuery);

  const handleToggle = React.useCallback(() => {
    if (isExpandable) onToggle(path);
  }, [isExpandable, onToggle, path]);

  const [pathCopied, setPathCopied] = React.useState(false);
  const [valueCopied, setValueCopied] = React.useState(false);

  const handleCopyPath = React.useCallback(() => {
    navigator.clipboard.writeText(path).then(() => {
      setPathCopied(true);
      setTimeout(() => setPathCopied(false), 1500);
    });
  }, [path]);

  const handleCopyValue = React.useCallback(() => {
    const text =
      typeof value === "string" ? value : JSON.stringify(value, null, 2);
    navigator.clipboard.writeText(text).then(() => {
      setValueCopied(true);
      setTimeout(() => setValueCopied(false), 1500);
    });
  }, [value]);

  const rowClass = cn(
    "group flex items-center gap-0 rounded py-px min-w-0",
    "hover:bg-zinc-800/40",
    nodeMatches && "bg-amber-400/10",
  );

  const rowStyle: React.CSSProperties = {
    paddingLeft: `${depth * 20 + 8}px`,
  };

  const copyIconClass = cn(
    "ml-1 inline-flex items-center justify-center rounded p-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    "text-zinc-500 opacity-0 group-hover:opacity-100 hover:!text-zinc-200 focus-visible:opacity-100",
  );

  const [menuOpen, setMenuOpen] = React.useState(false);

  const copyMenu = (
    <Popover open={menuOpen} onOpenChange={setMenuOpen}>
      <PopoverTrigger
        className={copyIconClass}
        aria-label={`Copy menu: ${path}`}
      >
        <CopyPlus className="size-3" />
      </PopoverTrigger>
      <PopoverPopup className="w-36 p-1">
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted"
          onClick={() => {
            handleCopyPath();
            setMenuOpen(false);
          }}
        >
          {pathCopied ? (
            <Check className="size-3 text-emerald-500" />
          ) : (
            <Clipboard className="size-3" />
          )}
          Copy path
        </button>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted"
          onClick={() => {
            handleCopyValue();
            setMenuOpen(false);
          }}
        >
          {valueCopied ? (
            <Check className="size-3 text-emerald-500" />
          ) : (
            <ClipboardCopy className="size-3" />
          )}
          Copy value
        </button>
      </PopoverPopup>
    </Popover>
  );

  function renderKey() {
    return (
      <TokenSpan token="key">
        {typeof keyName === "string" ? (
          <>
            &quot;
            <HighlightMatch text={keyName} query={searchQuery} />
            &quot;
          </>
        ) : (
          keyName
        )}
      </TokenSpan>
    );
  }

  function renderValue() {
    if (typeof value === "string") {
      return (
        <TokenSpan token="string" className="break-all">
          &quot;
          <HighlightMatch text={value} query={searchQuery} />
          &quot;
        </TokenSpan>
      );
    }
    if (value === null) {
      return (
        <TokenSpan token="null" italic>
          {searchQuery ? (
            <HighlightMatch text="null" query={searchQuery} />
          ) : (
            "null"
          )}
        </TokenSpan>
      );
    }
    if (typeof value === "number") {
      return (
        <TokenSpan token="number">
          <HighlightMatch text={String(value)} query={searchQuery} />
        </TokenSpan>
      );
    }
    if (typeof value === "boolean") {
      return (
        <TokenSpan token="boolean">
          <HighlightMatch text={String(value)} query={searchQuery} />
        </TokenSpan>
      );
    }
    return <span>{String(value)}</span>;
  }

  if (!isExpandable) {
    return (
      <div className={rowClass} style={rowStyle}>
        <span className="w-4 shrink-0" />
        <span className="min-w-0 flex-1 font-mono text-xs">
          {renderKey()}
          <TokenSpan token="punctuation">: </TokenSpan>
          {renderValue()}
          <TokenSpan token="punctuation">{comma}</TokenSpan>
        </span>
        {copyMenu}
      </div>
    );
  }

  const entries = Array.isArray(value)
    ? value.map((v, i) => [i, v] as [number, JsonValue])
    : (Object.entries(value as Record<string, JsonValue>) as [
        string,
        JsonValue,
      ][]);

  const filteredEntries = searchQuery
    ? entries.filter(([k, v]) => hasSearchMatch(v, k, searchQuery))
    : entries;
  const showAll = !searchQuery;
  const displayEntries = showAll ? entries : filteredEntries;

  return (
    <div>
      <div className={rowClass} style={rowStyle}>
        <button
          type="button"
          onClick={handleToggle}
          aria-label={isExpanded ? "Collapse" : "Expand"}
          className="flex size-4 shrink-0 items-center justify-center transition-transform"
        >
          <ChevronRight
            className={cn(
              "size-3 text-zinc-500 transition-transform",
              isExpanded && "rotate-90",
            )}
          />
        </button>
        <span className="min-w-0 flex-1 font-mono text-xs">
          {renderKey()}
          <TokenSpan token="punctuation">: </TokenSpan>
          <TokenSpan token="punctuation">{openBracket}</TokenSpan>
          {!isExpanded && (
            <>
              <span className="mx-1 text-[10px] text-zinc-500">
                {count} {count === 1 ? "item" : "items"}
              </span>
              <TokenSpan token="punctuation">
                {closeBracket}
                {comma}
              </TokenSpan>
            </>
          )}
        </span>
        {copyMenu}
      </div>

      {isExpanded && (
        <>
          {displayEntries.map(([k, v], i) => (
            <JsonNode
              key={`${k}-${i}`}
              keyName={k}
              value={v}
              path={buildPath(path, k)}
              depth={depth + 1}
              defaultExpanded={defaultExpanded}
              searchQuery={searchQuery}
              collapsedPaths={collapsedPaths}
              onToggle={onToggle}
              isLast={i === displayEntries.length - 1}
            />
          ))}
          <div
            className="font-mono text-xs text-zinc-400"
            style={{ paddingLeft: `${depth * 20 + 8 + 16}px` }}
          >
            {closeBracket}
            {comma}
          </div>
        </>
      )}
    </div>
  );
}

function collectPaths(
  value: JsonValue,
  path: string,
  maxDepth: number | true,
  depth: number,
  result: Set<string>,
): void {
  if (value === null || typeof value !== "object") return;
  if (maxDepth !== true && depth >= maxDepth) {
    result.add(path);
  }
  const entries = Array.isArray(value)
    ? value.map((v, i) => [i, v] as const)
    : Object.entries(value);
  for (const [k, v] of entries) {
    collectPaths(v, buildPath(path, k), maxDepth, depth + 1, result);
  }
}

function allExpandablePaths(
  value: JsonValue,
  rootName: string,
): Set<string> {
  const result = new Set<string>();
  collectAllExpandable(value, rootName, result);
  return result;
}

function collectAllExpandable(
  value: JsonValue,
  path: string,
  result: Set<string>,
): void {
  if (value === null || typeof value !== "object") return;
  result.add(path);
  const entries = Array.isArray(value)
    ? value.map((v, i) => [i, v] as const)
    : Object.entries(value);
  for (const [k, v] of entries) {
    collectAllExpandable(v, buildPath(path, k), result);
  }
}

interface JsonViewerProps
  extends Omit<React.ComponentProps<"div">, "children" | "title"> {
  /** Any JSON-serializable value to display. */
  data: JsonValue;
  /** Optional heading label. */
  title?: string;
  /** Label for the root node. Defaults to "root". */
  rootName?: string;
  /**
   * Depth to expand by default.
   * - Number: expand nodes up to this depth (default 1)
   * - `true`: expand all nodes
   */
  defaultExpanded?: number | true;
  /**
   * Mini mode: no border/shadow/toolbar. For inline embedding in other
   * components (e.g. log lines).
   */
  mini?: boolean;
  /** Optional tree surface color, used to match a parent log row. */
  backgroundColor?: string;
}

function JsonViewer({
  data,
  title,
  rootName = "root",
  defaultExpanded = 1,
  className,
  mini = false,
  backgroundColor,
  ...props
}: JsonViewerProps) {
  const [collapsedPaths, setCollapsedPaths] = React.useState<Set<string>>(
    () => {
      if (defaultExpanded === true) return new Set();
      const collapsed = new Set<string>();
      collectPaths(data, rootName, defaultExpanded, 0, collapsed);
      return collapsed;
    },
  );
  const [searchQuery, setSearchQuery] = React.useState("");
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [copiedAll, setCopiedAll] = React.useState(false);
  const [fullscreenOpen, setFullscreenOpen] = React.useState(false);
  const searchRef = React.useRef<HTMLInputElement>(null);

  const togglePath = React.useCallback((path: string) => {
    setCollapsedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const expandAll = React.useCallback(() => {
    setCollapsedPaths(new Set());
  }, []);

  const collapseAll = React.useCallback(() => {
    const all = allExpandablePaths(data, rootName);
    setCollapsedPaths(all);
  }, [data, rootName]);

  const copyJson = React.useCallback(() => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2)).then(() => {
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 1500);
    });
  }, [data]);

  const toggleSearch = React.useCallback(() => {
    setSearchOpen((prev) => {
      if (!prev) {
        requestAnimationFrame(() => searchRef.current?.focus());
      } else {
        setSearchQuery("");
      }
      return !prev;
    });
  }, []);

  React.useEffect(() => {
    if (searchQuery) {
      setCollapsedPaths(new Set());
    }
  }, [searchQuery]);

  const isExpandable = data !== null && typeof data === "object";
  const type = typeOf(data);
  const rootOpenBracket = type === "array" ? "[" : "{";
  const rootCloseBracket = type === "array" ? "]" : "}";
  const rootCount = isExpandable ? countEntries(data) : 0;
  const isRootCollapsed = isExpandable && collapsedPaths.has(rootName);

  const rootEntries = isExpandable
    ? Array.isArray(data)
      ? data.map((v, i) => [i, v] as [number, JsonValue])
      : (Object.entries(data as Record<string, JsonValue>) as [
          string,
          JsonValue,
        ][])
    : [];
  const rootDisplayEntries = searchQuery
    ? rootEntries.filter(([k, v]) => hasSearchMatch(v, k, searchQuery))
    : rootEntries;

  return (
    <>
      <div
        data-slot="json-viewer"
        className={cn(
          mini
            ? "overflow-hidden"
            : "bg-popover text-popover-foreground overflow-hidden rounded-xl border shadow-sm",
          className,
        )}
        {...props}
      >
        {/* Toolbar — hidden in mini mode */}
        {!mini && (
          <div className="group flex items-center justify-between border-b px-3 py-2 sm:px-4">
            <div className="flex items-center gap-2">
              {title && (
                <h3 className="text-foreground text-sm font-semibold">
                  {title}
                </h3>
              )}
              {isExpandable && (
                <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[10px] font-medium">
                  {countEntries(data)} {type === "array" ? "items" : "keys"}
                </span>
              )}
            </div>
            <div className="text-muted-foreground flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                type="button"
                onClick={toggleSearch}
                aria-label={searchOpen ? "Close search" : "Search"}
                className={cn(
                  "hover:bg-muted hover:text-foreground inline-flex items-center justify-center rounded-md p-1.5 transition-colors",
                  searchOpen && "bg-muted text-foreground",
                )}
              >
                <Search className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={expandAll}
                aria-label="Expand all"
                className="hover:bg-muted hover:text-foreground inline-flex items-center justify-center rounded-md p-1.5 transition-colors"
              >
                <UnfoldHorizontal className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={collapseAll}
                aria-label="Collapse all"
                className="hover:bg-muted hover:text-foreground inline-flex items-center justify-center rounded-md p-1.5 transition-colors"
              >
                <FoldHorizontal className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={copyJson}
                aria-label="Copy JSON"
                className="hover:bg-muted hover:text-foreground inline-flex items-center justify-center rounded-md p-1.5 transition-colors"
              >
                {copiedAll ? (
                  <Check className="size-3.5 text-emerald-500" />
                ) : (
                  <Copy className="size-3.5" />
                )}
              </button>
            </div>
          </div>
        )}

        {/* Search bar — hidden in mini mode */}
        {!mini && searchOpen && (
          <div className="bg-muted/20 flex items-center gap-2 border-b px-3 py-1.5 sm:px-4">
            <Search className="text-muted-foreground size-3.5 shrink-0" />
            <input
              ref={searchRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter keys and values…"
              className="text-foreground placeholder:text-muted-foreground/50 min-w-0 flex-1 bg-transparent font-mono text-xs focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="Clear search"
                className="text-muted-foreground hover:text-foreground inline-flex items-center justify-center rounded p-0.5 transition-colors"
              >
                <X className="size-3" />
              </button>
            )}
          </div>
        )}

        {/* Tree — fixed dark surface so the token colors stay readable in the
            (always-dark) log panel and in the fullscreen dialog alike. */}
        <div className={cn("w-full min-w-0 overflow-auto py-1", !backgroundColor && "bg-zinc-950")} style={backgroundColor ? { backgroundColor } : undefined}>
          {isExpandable ? (
            <>
              <div className="group flex items-center gap-0 py-px font-mono text-xs">
                <button
                  type="button"
                  onClick={() => togglePath(rootName)}
                  aria-label={isRootCollapsed ? "Expand" : "Collapse"}
                  className="flex size-4 shrink-0 items-center justify-center transition-transform"
                >
                  <ChevronRight
                    className={cn(
                      "size-3 text-zinc-500 transition-transform",
                      !isRootCollapsed && "rotate-90",
                    )}
                  />
                </button>
                <TokenSpan token="punctuation">{rootOpenBracket}</TokenSpan>
                {isRootCollapsed && (
                  <>
                    <span className="mx-1 text-[10px] text-zinc-500">
                      {rootCount} {rootCount === 1 ? "item" : "items"}
                    </span>
                    <TokenSpan token="punctuation">
                      {rootCloseBracket}
                    </TokenSpan>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setFullscreenOpen(true)}
                  aria-label="Fullscreen"
                  className="text-muted-foreground hover:text-foreground ml-auto mr-1 flex size-4 shrink-0 items-center justify-center rounded opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <Maximize2 className="size-3" />
                </button>
              </div>
              {!isRootCollapsed && (
                <>
                  {rootDisplayEntries.map(([k, v], i) => (
                    <JsonNode
                      key={`${k}-${i}`}
                      keyName={k}
                      value={v}
                      path={buildPath(rootName, k)}
                      depth={1}
                      defaultExpanded={defaultExpanded}
                      searchQuery={searchQuery}
                      collapsedPaths={collapsedPaths}
                      onToggle={togglePath}
                      isLast={i === rootDisplayEntries.length - 1}
                    />
                  ))}
                  <div className="pl-6 font-mono text-xs text-zinc-400">
                    {rootCloseBracket}
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="px-4 py-2 font-mono text-xs break-all">
              {typeof data === "string" ? (
                <TokenSpan token="string">&quot;{data}&quot;</TokenSpan>
              ) : typeof data === "number" ? (
                <TokenSpan token="number">{String(data)}</TokenSpan>
              ) : typeof data === "boolean" ? (
                <TokenSpan token="boolean">{String(data)}</TokenSpan>
              ) : (
                <TokenSpan token="null" italic>null</TokenSpan>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Fullscreen Dialog */}
      <Dialog open={fullscreenOpen} onOpenChange={setFullscreenOpen}>
        <DialogPopup className="sm:max-w-4xl">
          <DialogTitle className="sr-only">
            {title ?? "JSON Viewer"}
          </DialogTitle>
          <div className="max-h-[70vh] overflow-auto">
            <JsonViewer
              data={data}
              title={title}
              rootName={rootName}
              defaultExpanded={true}
            />
          </div>
        </DialogPopup>
      </Dialog>
    </>
  );
}

export { JsonViewer, type JsonViewerProps, type JsonValue };
