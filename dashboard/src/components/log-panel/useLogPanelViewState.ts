import { useEffect, useMemo, useState } from "react";
import type { LogEntry } from "@/lib/types";
import type { FontSize, LevelFilter } from "./types";
import { loadShowJson } from "./constants";

export function useLogPanelViewState(entries: LogEntry[]) {
  const [search, setSearch] = useState("");
  const [selectedLevels, setSelectedLevels] = useState<Set<LevelFilter>>(new Set());
  const [selectedDevices, setSelectedDevices] = useState<Set<string>>(new Set());
  const [showTime, setShowTime] = useState(true);
  const [showLineNumbers, setShowLineNumbers] = useState(false);
  const [showJson, setShowJson] = useState<boolean>(loadShowJson);
  const [colorizeBackground, setColorizeBackground] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const [fontSize, setFontSize] = useState<FontSize>("xs");
  const devices = useMemo(() => [...new Set(entries.map((entry) => entry.clientName).filter((name): name is string => !!name))].sort(), [entries]);
  const visibleEntries = useMemo(() => {
    const levels = selectedLevels.size === 0 ? entries : entries.filter((entry) => entry.level !== undefined && selectedLevels.has(entry.level));
    const devicesFiltered = selectedDevices.size === 0 ? levels : levels.filter((entry) => entry.clientName && selectedDevices.has(entry.clientName));
    const term = search.trim().toLowerCase();
    return term ? devicesFiltered.filter((entry) => entry.message.toLowerCase().includes(term)) : devicesFiltered;
  }, [entries, selectedLevels, selectedDevices, search]);
  const levelCounts = useMemo(() => entries.reduce<Record<LevelFilter, number>>((counts, entry) => {
    if (entry.level) counts[entry.level]++;
    return counts;
  }, { debug: 0, info: 0, warn: 0, error: 0 }), [entries]);
  const deviceCounts = useMemo(() => entries.reduce<Record<string, number>>((counts, entry) => {
    if (entry.clientName) counts[entry.clientName] = (counts[entry.clientName] ?? 0) + 1;
    return counts;
  }, {}), [entries]);
  useEffect(() => setSelectedDevices((current) => {
    const next = new Set([...current].filter((name) => devices.includes(name)));
    return next.size === current.size ? current : next;
  }), [devices]);
  return { search, setSearch, selectedLevels, setSelectedLevels, selectedDevices, setSelectedDevices, devices, visibleEntries, levelCounts, deviceCounts, showTime, setShowTime, showLineNumbers, setShowLineNumbers, showJson, setShowJson, colorizeBackground, setColorizeBackground, autoScroll, setAutoScroll, fontSize, setFontSize };
}
