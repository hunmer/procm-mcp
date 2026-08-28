export const TAB_ROUTES = {
  processes: "/processes",
  history: "/history",
  rooms: "/rooms",
  system: "/system",
  playground: "/playground",
} as const;

export type DashboardTab = keyof typeof TAB_ROUTES;

export function readTabRoute(): DashboardTab {
  const route = window.location.hash.slice(1);
  return (Object.entries(TAB_ROUTES).find(([, path]) => path === route)?.[0] ??
    "processes") as DashboardTab;
}

export function writeTabRoute(tab: DashboardTab, replace = false): void {
  const url = new URL(window.location.href);
  url.hash = TAB_ROUTES[tab];
  window.history[replace ? "replaceState" : "pushState"](
    window.history.state,
    "",
    url,
  );
}

export function formatUptime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}h ${mm}m ${ss}s` : `${mm}m ${ss}s`;
}
