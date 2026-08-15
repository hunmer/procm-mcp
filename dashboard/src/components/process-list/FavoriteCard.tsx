import { useTranslation } from "react-i18next";
import { PencilIcon, PlayIcon, TrashIcon } from "lucide-react";
import { Button } from "@/registry/default/ui/button";
import { Card, CardAction, CardHeader, CardPanel } from "@/registry/default/ui/card";
import type { Favorite } from "@/lib/favorites";

// A saved launch "recipe" card: command + cwd plus a Launch button that starts
// it as a real process via the backend. Rendered inside the merged list's
// category groups alongside the live process cards started from it.
export function FavoriteCard({
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
  const { t } = useTranslation();
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
            aria-label={t("favorites.editAria")}
            title={t("favorites.editTitle")}
            onClick={onEdit}
          >
            <PencilIcon />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={t("favorites.removeAria")}
            title={t("favorites.removeTitle")}
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
            {t("favorites.cardCommand")}
          </span>
          <code className="text-foreground/90 line-clamp-2 break-all bg-transparent text-xs">
            {cmd}
          </code>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-[10px] uppercase tracking-wide">
            {t("favorites.cardCwd")}
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
            {t("favorites.launch")}
          </Button>
        </div>
      </CardPanel>
    </Card>
  );
}
