// Log body font size, driven from the view-settings popover. The default
// ("xs") matches the previous hardcoded text-xs scale.
export type FontSize = "xs" | "sm" | "md";

// Structured levels selectable in the quick filter. Multiple levels may be
// checked at once; an empty selection shows everything (including legacy
// plain output without a level).
export type LevelFilter = "debug" | "info" | "warn" | "error";
