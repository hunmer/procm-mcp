import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  DatabaseIcon,
  DownloadIcon,
  FileTextIcon,
  FolderOpenIcon,
  SettingsIcon,
  PaletteIcon,
  TrashIcon,
  UploadIcon,
} from "lucide-react";
import {
  clearServerLogs,
  getServerLogInfo,
  openFolder,
  saveImportedProcess,
  updateServerLogMaxBytes,
} from "@/lib/api";
import { LANGUAGES, LANGUAGE_LABELS, type Language } from "@/i18n";
import { useLanguage } from "@/lib/useLanguage";
import { useTheme, type Theme, type ThemeStyle } from "@/lib/useTheme";
import type { ProcessView, ServerLogInfo } from "@/lib/types";
import { Button } from "@/registry/default/ui/button";
import { Input } from "@/registry/default/ui/input";
import { Textarea } from "@/registry/default/ui/textarea";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "@/registry/default/ui/dialog";
import {
  Select,
  SelectIcon,
  SelectItem,
  SelectItemText,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@/registry/default/ui/select";
import {
  Tabs,
  TabsList,
  TabsPanel,
  TabsTab,
} from "@/registry/default/ui/tabs";
import { Field, FieldDescription, FieldLabel } from "@/registry/default/ui/field";

// One launch recipe inside an exported/imported process list JSON file.
// Runtime state (pid, status, exit code…) is excluded — only fields that can
// recreate the process belong on the wire. Accepts the exported shape and the
// ProcessView shape alike.
interface ProcessExportItem {
  name?: string;
  script: string;
  args: string[];
  cwd: string;
  desc?: string;
  group?: string;
}

const EXPORT_FILENAME = "procm-processes.json";

// Compact bytes -> human string for the Logs panel's file summary.
function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

// Validate one parsed JSON entry; null when it lacks the required launch
// fields (script + cwd), so a bad row is skipped instead of failing the batch.
function toImportItem(raw: unknown): ProcessExportItem | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.script !== "string" || !r.script.trim()) return null;
  if (typeof r.cwd !== "string" || !r.cwd.trim()) return null;
  return {
    name: typeof r.name === "string" ? r.name : undefined,
    script: r.script,
    args: Array.isArray(r.args) ? r.args.map(String) : [],
    cwd: r.cwd,
    desc: typeof r.desc === "string" ? r.desc : undefined,
    group: typeof r.group === "string" ? r.group : undefined,
  };
}

export function SettingsDialog({
  processes,
  onToast,
}: {
  processes: ProcessView[];
  onToast: (message: string, isError?: boolean) => void;
}) {
  const { t } = useTranslation();
  const { language, changeLanguage } = useLanguage();
  const { theme, setTheme, style, setStyle, customCss, setCustomCss } = useTheme();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // Logs panel state: backend debug.log info + the MB input. Loaded each time
  // the dialog opens so the cap and file list stay fresh.
  const [logInfo, setLogInfo] = useState<ServerLogInfo | null>(null);
  const [maxSizeMb, setMaxSizeMb] = useState("");
  const [logBusy, setLogBusy] = useState(false);
  // Hidden file input triggered by the import button — keeps the native file
  // picker without rendering its default look.
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    getServerLogInfo()
      .then((info) => {
        if (!alive) return;
        setLogInfo(info);
        setMaxSizeMb(String(Math.round(info.maxBytes / (1024 * 1024))));
      })
      .catch(() => setLogInfo(null));
    return () => {
      alive = false;
    };
  }, [open]);
  // items-driven selects (p-field-11): SelectValue renders the selected
  // item's label automatically. Labels go through t() so they follow the UI
  // language on change.
  const languageItems = LANGUAGES.map((lng) => ({
    label: LANGUAGE_LABELS[lng],
    value: lng,
  }));
  const themeItems = (["light", "dark"] as const).map((th) => ({
    label: t(th === "dark" ? "common.darkTheme" : "common.lightTheme"),
    value: th as Theme,
  }));
  const styleItems: { label: string; value: ThemeStyle; description: string }[] = [
    { label: t("settings.styleDefault"), value: "default", description: t("settings.styleDefaultDesc") },
    { label: "Vercel", value: "vercel", description: t("settings.styleVercelDesc") },
    { label: "Twitter", value: "twitter", description: t("settings.styleTwitterDesc") },
    { label: "Untitled Theme", value: "untitled", description: t("settings.styleUntitledDesc") },
    { label: "Orion-Black", value: "orion", description: t("settings.styleOrionDesc") },
    { label: "Cyberpunk 2077 / Deus Ex", value: "cyberpunk", description: t("settings.styleCyberpunkDesc") },
    { label: "Candyland", value: "candyland", description: t("settings.styleCandylandDesc") },
  ];

  // Download the current process list's launch recipes as a JSON file.
  function exportProcesses() {
    const items: ProcessExportItem[] = processes.map((p) => ({
      name: p.name,
      script: p.script,
      args: p.args,
      cwd: p.cwd,
      desc: p.desc ?? undefined,
      group: p.group ?? undefined,
    }));
    const blob = new Blob(
      [JSON.stringify({ exportedAt: Date.now(), processes: items }, null, 2)],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = EXPORT_FILENAME;
    a.click();
    URL.revokeObjectURL(url);
    onToast(t("settings.exportDone", { count: items.length }));
  }

  // Read a JSON file and re-create each entry as a favorite record via
  // /api/processes/import (records only — nothing is started).
  async function importFile(file: File) {
    setBusy(true);
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(await file.text());
      } catch {
        throw new Error(t("settings.badFile"));
      }
      const rows = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === "object" &&
            Array.isArray((parsed as { processes?: unknown }).processes)
          ? (parsed as { processes: unknown[] }).processes
          : null;
      if (!rows) throw new Error(t("settings.badFile"));
      const items = rows
        .map(toImportItem)
        .filter((item): item is ProcessExportItem => item != null);
      if (items.length === 0) throw new Error(t("settings.badFile"));
      // Sequential so duplicate commands within one file overwrite each other
      // server-side instead of racing past the dedupe check.
      for (const item of items) await saveImportedProcess(item);
      onToast(t("settings.importDone", { count: items.length }));
    } catch (err) {
      onToast(err instanceof Error ? err.message : String(err), true);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  // Persist the debug.log size cap. An empty input clears the override and
  // restores the default (20MB, or the env value when set).
  async function saveLogMaxSize() {
    setLogBusy(true);
    try {
      const mb = Number(maxSizeMb.trim());
      const isEmpty = maxSizeMb.trim() === "";
      if (!isEmpty && (!Number.isFinite(mb) || mb <= 0)) {
        throw new Error(t("settings.logSaveBad"));
      }
      const info = await updateServerLogMaxBytes(isEmpty ? null : Math.round(mb * 1024 * 1024));
      setLogInfo(info);
      setMaxSizeMb(String(Math.round(info.maxBytes / (1024 * 1024))));
      onToast(t("settings.logSaved"));
    } catch (err) {
      onToast(err instanceof Error ? err.message : String(err), true);
    } finally {
      setLogBusy(false);
    }
  }

  // Truncate every debug.log file on the backend, then refresh the panel.
  async function clearLogs() {
    setLogBusy(true);
    try {
      const { cleared } = await clearServerLogs();
      onToast(t("settings.logsCleared", { count: cleared.length }));
      setLogInfo(await getServerLogInfo());
    } catch (err) {
      onToast(err instanceof Error ? err.message : String(err), true);
    } finally {
      setLogBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button variant="outline" size="icon" />}
        aria-label={t("settings.title")}
        title={t("settings.title")}
      >
        <SettingsIcon />
      </DialogTrigger>
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>{t("settings.title")}</DialogTitle>
          <DialogDescription>{t("settings.description")}</DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <div className="min-w-0">
          {/* Vertical tabs (p-tabs-11): underline list with a start border,
              panels to its right. */}
          <Tabs
            className="w-full flex-row"
            defaultValue="general"
            orientation="vertical"
          >
            <div className="border-s min-w-36 shrink-0">
              <TabsList variant="underline">
                <TabsTab value="general">
                  <SettingsIcon aria-hidden="true" />
                  {t("settings.tabGeneral")}
                </TabsTab>
                <TabsTab value="style">
                  <PaletteIcon aria-hidden="true" />
                  {t("settings.tabStyle")}
                </TabsTab>
                <TabsTab value="data">
                  <DatabaseIcon aria-hidden="true" />
                  {t("settings.tabData")}
                </TabsTab>
                <TabsTab value="logs">
                  <FileTextIcon aria-hidden="true" />
                  {t("settings.tabLogs")}
                </TabsTab>
              </TabsList>
            </div>
            <TabsPanel value="general" className="min-w-0 flex-1 space-y-4 py-4 pl-6">
              <Field>
                <FieldLabel>{t("settings.languageLabel")}</FieldLabel>
                <Select
                  items={languageItems}
                  value={language}
                  onValueChange={(v) =>
                    changeLanguage(LANGUAGES.includes(v as Language) ? (v as Language) : "en")
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                    <SelectIcon />
                  </SelectTrigger>
                  <SelectPopup portalProps={{ className: "relative z-[60]" }}>
                    {languageItems.map(({ label, value }) => (
                      <SelectItem key={value} value={value}>
                        <SelectItemText>{label}</SelectItemText>
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
                <FieldDescription>{t("settings.languageDesc")}</FieldDescription>
              </Field>
              <Field>
                <FieldLabel>{t("settings.themeLabel")}</FieldLabel>
                <Select
                  items={themeItems}
                  value={theme}
                  onValueChange={(v) => setTheme(v === "light" ? "light" : "dark")}
                >
                  <SelectTrigger>
                    <SelectValue />
                    <SelectIcon />
                  </SelectTrigger>
                  <SelectPopup portalProps={{ className: "relative z-[60]" }}>
                    {themeItems.map(({ label, value }) => (
                      <SelectItem key={value} value={value}>
                        <SelectItemText>{label}</SelectItemText>
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
                <FieldDescription>{t("settings.themeDesc")}</FieldDescription>
              </Field>
            </TabsPanel>
            <TabsPanel value="style" className="min-w-0 flex-1 space-y-4 py-4 pl-6">
              <div>
                <p className="text-muted-foreground text-sm">{t("settings.styleDesc")}</p>
              </div>
              <Field>
                <FieldLabel>{t("settings.styleLabel")}</FieldLabel>
                <Select
                  items={styleItems}
                  value={style}
                  onValueChange={(v) => {
                    if (styleItems.some((item) => item.value === v)) setStyle(v as ThemeStyle);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                    <SelectIcon />
                  </SelectTrigger>
                  <SelectPopup portalProps={{ className: "relative z-[60]" }}>
                    {styleItems.map(({ label, value }) => (
                      <SelectItem key={value} value={value}>
                        <SelectItemText>{label}</SelectItemText>
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
              </Field>
              <Field>
                <FieldLabel>{t("settings.customCssLabel")}</FieldLabel>
                <Textarea value={customCss} onChange={(e) => setCustomCss(e.target.value)} rows={6} placeholder={t("settings.customCssPlaceholder")} />
                <FieldDescription>{t("settings.customCssDesc")}</FieldDescription>
              </Field>
              <p className="text-muted-foreground text-xs">
                {t("settings.styleSources")} <a className="underline" href="https://shadcnthemer.com/" target="_blank" rel="noreferrer">shadcnthemer.com</a>{" · "}<a className="underline" href="https://tweakcn.com/" target="_blank" rel="noreferrer">tweakcn.com</a>
              </p>
            </TabsPanel>
            <TabsPanel value="data" className="min-w-0 flex-1 space-y-4 py-4 pl-6">
              <p className="text-muted-foreground text-sm">
                {t("settings.dataDesc")}{" "}
                {t("settings.processCount", { count: processes.length })}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={exportProcesses}
                  disabled={processes.length === 0}
                >
                  <DownloadIcon />
                  {t("settings.export")}
                </Button>
                <Button
                  variant="outline"
                  loading={busy}
                  onClick={() => fileRef.current?.click()}
                >
                  <UploadIcon />
                  {t("settings.import")}
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void importFile(file);
                  }}
                />
              </div>
              <p className="text-muted-foreground text-xs">
                {t("settings.importHelp")}
              </p>
            </TabsPanel>
            <TabsPanel value="logs" className="min-w-0 flex-1 space-y-4 py-4 pl-6">
              <p className="text-muted-foreground text-sm">{t("settings.logsDesc")}</p>
              <Field>
                <FieldLabel>{t("settings.logMaxSizeLabel")}</FieldLabel>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    value={maxSizeMb}
                    onChange={(e) => setMaxSizeMb(e.target.value)}
                    className="w-32"
                    aria-label={t("settings.logMaxSizeLabel")}
                  />
                  <Button
                    variant="outline"
                    loading={logBusy}
                    onClick={() => void saveLogMaxSize()}
                  >
                    {t("settings.logMaxSizeSave")}
                  </Button>
                </div>
                <FieldDescription>
                  {t("settings.logMaxSizeDesc", {
                    default: Math.round((logInfo?.defaultMaxBytes ?? 20 * 1024 * 1024) / (1024 * 1024)),
                  })}
                </FieldDescription>
              </Field>
              <div className="space-y-2">
                <p className="text-muted-foreground text-sm">
                  {logInfo
                    ? t("settings.logFilesInfo", {
                        count: logInfo.files.length,
                        size: formatBytes(logInfo.files.reduce((sum, f) => sum + f.size, 0)),
                      })
                    : t("settings.logLoading")}
                </p>
                <Button
                  variant="outline"
                  loading={logBusy}
                  disabled={!logInfo || logInfo.files.length === 0}
                  onClick={() => void clearLogs()}
                >
                  <TrashIcon />
                  {t("settings.clearLogs")}
                </Button>
                <Button
                  variant="outline"
                  disabled={!logInfo}
                  title={logInfo?.dir}
                  onClick={() => {
                    if (logInfo) void openFolder(logInfo.dir).catch((err) =>
                      onToast(err instanceof Error ? err.message : String(err), true),
                    );
                  }}
                >
                  <FolderOpenIcon />
                  {t("settings.openLogFolder")}
                </Button>
              </div>
            </TabsPanel>
          </Tabs>
          </div>
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  );
}
