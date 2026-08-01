import { useMemo, useState } from "react";
import { Button } from "@/registry/default/ui/button";
import { Input } from "@/registry/default/ui/input";
import { Badge } from "@/registry/default/ui/badge";
import {
  Card,
  CardAction,
  CardHeader,
  CardPanel,
} from "@/registry/default/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/registry/default/ui/empty";
import {
  DownloadIcon,
  FolderIcon,
  FolderOpenIcon,
  PencilIcon,
  PlayIcon,
  SearchIcon,
  StarIcon,
  TrashIcon,
} from "lucide-react";
import {
  categoryLabel,
  groupByCategory,
  type Favorite,
} from "@/lib/favorites";

// Whether a category label looks like an absolute folder path that the backend
// could open in the OS file manager. Matches Windows drive paths (C:\, C:/),
// UNC paths (\\server\share), and POSIX absolute paths (/...). Relative names
// like "Dev servers" or "Uncategorized" return false so no button is shown.
function looksLikePath(label: string): boolean {
  return /^([a-zA-Z]:[\\/]|\\\\|\/)/.test(label.trim());
}

interface FavoritesViewProps {
  favorites: Favorite[];
  // Launch a favorite as a real process via the backend.
  onLaunch: (fav: Favorite) => void;
  // Open the editor dialog on a favorite.
  onEdit: (fav: Favorite) => void;
  // Remove a favorite by id.
  onRemove: (id: string) => void;
  // Open the folder-import dialog (scan a project dir for commands).
  onImport: () => void;
  // Open a category's folder in the OS file manager (only offered when the
  // category label is an absolute path, e.g. an imported project directory).
  onOpenFolder: (path: string) => void;
  // Delete every favorite in a category group, given the ids of its items.
  onRemoveCategory: (ids: string[]) => void;
}

export function FavoritesView({
  favorites,
  onLaunch,
  onEdit,
  onRemove,
  onImport,
  onOpenFolder,
  onRemoveCategory,
}: FavoritesViewProps) {
  const [query, setQuery] = useState("");

  // Client-side filter across name/script/desc/category. Grouping is computed
  // from the filtered set so empty groups vanish entirely.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return favorites;
    return favorites.filter((f) => {
      const hay = [
        f.name ?? "",
        f.script,
        f.args.join(" "),
        f.desc ?? "",
        categoryLabel(f.category),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [favorites, query]);

  const groups = useMemo(() => groupByCategory(filtered), [filtered]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Filter bar: search across all favorites. */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-2.5">
        <div className="relative min-w-[180px] flex-1">
          <SearchIcon className="text-foreground/50 pointer-events-none absolute top-1/2 left-2.5 z-10 size-3.5 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter favorites…"
            className="h-8 pl-8 text-xs"
          />
        </div>
        <span className="text-muted-foreground text-xs">
          {favorites.length === filtered.length
            ? `${favorites.length} favorite${favorites.length === 1 ? "" : "s"}`
            : `${filtered.length} of ${favorites.length}`}
        </span>
        <Button
          size="icon-sm"
          variant="outline"
          aria-label="Import from folder"
          title="Import from folder"
          onClick={onImport}
        >
          <DownloadIcon />
        </Button>
      </div>

      {/* Scrollable card grid, grouped by category. */}
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {groups.length === 0 ? (
          <Empty className="mx-auto max-w-sm py-16">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <StarIcon />
              </EmptyMedia>
              <EmptyTitle>
                {favorites.length === 0
                  ? "No favorites yet"
                  : "No favorites match the filter"}
              </EmptyTitle>
              <EmptyDescription>
                {favorites.length === 0
                  ? "Star a process in the list to save it here for quick launch."
                  : "Try a different search term."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="flex flex-col gap-6">
            {groups.map((group) => (
              <section key={group.label}>
                <div className="mb-2.5 flex items-center gap-2">
                  <FolderIcon className="text-muted-foreground size-3.5" />
                  <h3 className="text-sm font-semibold">{group.label}</h3>
                  <Badge variant="secondary" className="tabular-nums">
                    {group.items.length}
                  </Badge>
                  <div className="ml-auto flex items-center gap-0.5">
                    {looksLikePath(group.label) && (
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Open folder ${group.label}`}
                        title="Open in file manager"
                        onClick={() => onOpenFolder(group.label)}
                        className="text-muted-foreground"
                      >
                        <FolderOpenIcon />
                      </Button>
                    )}
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Delete group ${group.label}`}
                      title="Delete group"
                      onClick={() =>
                        onRemoveCategory(group.items.map((f) => f.id))
                      }
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <TrashIcon />
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {group.items.map((f) => (
                    <FavoriteCard
                      key={f.id}
                      favorite={f}
                      onLaunch={() => onLaunch(f)}
                      onEdit={() => onEdit(f)}
                      onRemove={() => onRemove(f.id)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FavoriteCard({
  favorite,
  onLaunch,
  onEdit,
  onRemove,
}: {
  favorite: Favorite;
  onLaunch: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const f = favorite;
  const cmd = `${f.script}${f.args.length ? " " + f.args.join(" ") : ""}`;
  return (
    <Card className="gap-0">
      <CardHeader className="border-b p-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate font-mono text-sm font-semibold">
            {f.name ?? f.script}
          </span>
          {f.desc ? (
            <span
              className="text-muted-foreground line-clamp-1 text-xs"
              title={f.desc}
            >
              {f.desc}
            </span>
          ) : (
            <span className="text-muted-foreground text-xs">—</span>
          )}
        </div>
        <CardAction className="row-span-1 self-center">
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Edit favorite"
            title="Edit"
            onClick={onEdit}
          >
            <PencilIcon />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Remove favorite"
            title="Remove"
            onClick={onRemove}
            className="text-muted-foreground hover:text-destructive"
          >
            <TrashIcon />
          </Button>
        </CardAction>
      </CardHeader>
      <CardPanel className="flex flex-col gap-3 p-4">
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-[10px] uppercase tracking-wide">
            Command
          </span>
          <code className="text-foreground/90 line-clamp-2 break-all bg-transparent text-xs">
            {cmd}
          </code>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-[10px] uppercase tracking-wide">
            Working directory
          </span>
          <span
            className="text-foreground/90 line-clamp-1 break-all font-mono text-xs"
            title={f.cwd}
          >
            {f.cwd}
          </span>
        </div>
        <div className="mt-1 flex items-center justify-end">
          <Button size="sm" onClick={onLaunch}>
            <PlayIcon />
            Launch
          </Button>
        </div>
      </CardPanel>
    </Card>
  );
}
