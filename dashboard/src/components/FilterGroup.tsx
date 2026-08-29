import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import { ChevronsUpDownIcon, FunnelIcon, SearchIcon, XIcon } from "lucide-react";
import { cn } from "@/registry/default/lib/utils";
import { Badge } from "@/registry/default/ui/badge";
import { Button, buttonVariants } from "@/registry/default/ui/button";
import {
  Combobox,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
  ComboboxTrigger,
} from "@/registry/default/ui/combobox";
import { Group, GroupSeparator, GroupText } from "@/registry/default/ui/group";
import { Input } from "@/registry/default/ui/input";

// Shared group label chip styled like an outline sm button (p-group-23), so
// every filter group reads as one connected control.
function FilterGroupLabel({ children }: { children: ReactNode }) {
  return (
    <GroupText
      className={cn(
        buttonVariants({ size: "sm", variant: "outline" }),
        "pointer-events-none",
      )}
    >
      {children}
    </GroupText>
  );
}

// One p-group-23-style filter: a labeled Group wrapping a multi-select
// combobox (trigger shows the first selection + "+N") and a trailing clear
// button. Generic over the item type; `selected` must hold the same
// references/values as `items` so the combobox can track them.
export function FilterGroup<T>({
  allLabel,
  ariaLabel,
  emptyText,
  itemCount,
  itemLabel,
  items,
  label,
  onClear,
  onToggle,
  placeholder,
  renderDot,
  selected,
}: {
  allLabel: string;
  ariaLabel: string;
  emptyText: string;
  itemCount: (item: T) => number | undefined;
  itemLabel: (item: T) => string;
  items: readonly T[];
  label: string;
  onClear: () => void;
  onToggle: (item: T) => void;
  placeholder: string;
  renderDot?: (item: T) => ReactNode;
  selected: T[];
}) {
  const { t } = useTranslation();
  const remaining = selected.length - 1;
  return (
    <Group>
      <FilterGroupLabel>
        <FunnelIcon />
        {label}
      </FilterGroupLabel>
      <GroupSeparator />
      <Combobox
        autoHighlight
        items={items}
        multiple
        onValueChange={(value) => {
          const next = new Set(value as T[]);
          items.forEach((item) => {
            if (next.has(item) !== selected.includes(item)) onToggle(item);
          });
        }}
        value={selected}
      >
        <ComboboxTrigger
          render={
            <Button
              className={selected.length === 0 ? "justify-between" : undefined}
              size="sm"
              variant="outline"
            />
          }
        >
          {selected.length === 0 ? (
            allLabel
          ) : (
            <div className="flex items-center gap-2">
              {renderDot?.(selected[0])}
              <span className="truncate">{itemLabel(selected[0])}</span>
              {remaining > 0 && (
                <Badge className="tabular-nums" variant="secondary">
                  +{remaining}
                </Badge>
              )}
            </div>
          )}
          {selected.length === 0 && <ChevronsUpDownIcon className="-me-1!" />}
        </ComboboxTrigger>
        <ComboboxPopup aria-label={ariaLabel}>
          <div className="border-b p-2">
            <ComboboxInput
              className="rounded-md before:rounded-[calc(var(--radius-md)-1px)]"
              placeholder={placeholder}
              showTrigger={false}
              startAddon={<SearchIcon />}
            />
          </div>
          <ComboboxEmpty>{emptyText}</ComboboxEmpty>
          <ComboboxList>
            {(item: T) => {
              const count = itemCount(item);
              return (
                <ComboboxItem key={itemLabel(item)} value={item}>
                  <div className="flex w-full items-center gap-2">
                    {renderDot?.(item)}
                    <span className="truncate">{itemLabel(item)}</span>
                    {count ? (
                      <span className="text-muted-foreground ms-auto ps-2 text-xs font-normal tabular-nums">
                        {count}
                      </span>
                    ) : null}
                  </div>
                </ComboboxItem>
              );
            }}
          </ComboboxList>
        </ComboboxPopup>
      </Combobox>
      <GroupSeparator />
      <Button
        aria-label={t("logs.clearFilterAria")}
        onClick={onClear}
        size="icon-sm"
        variant="outline"
      >
        <XIcon />
      </Button>
    </Group>
  );
}

// The free-text sibling of FilterGroup, shaped like coss p-group-15 ("group
// with search") minus the trailing button: the clear ✕ lives inside the
// input's right edge and only appears when there is text to clear — the
// placeholder carries the field name. Used for substring filters over
// unbounded values such as process names, paths or command lines.
export function FilterSearchGroup({
  label,
  onClear,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  onClear: () => void;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <Group aria-label={label} className="min-w-[180px] flex-1">
      <div className="relative w-full">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-label={label}
          className="h-8 w-full min-w-0 pr-8 text-xs"
        />
        {value && (
          <button
            type="button"
            aria-label={t("system.clearFilter")}
            onClick={onClear}
            className="text-muted-foreground hover:text-foreground absolute right-2 top-1/2 -translate-y-1/2"
          >
            <XIcon className="size-3.5" />
          </button>
        )}
      </div>
    </Group>
  );
}
