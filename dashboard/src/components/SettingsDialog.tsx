import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  DatabaseIcon,
  DownloadIcon,
  SettingsIcon,
  UploadIcon,
} from "lucide-react";
import { saveImportedProcess } from "@/lib/api";
import { LANGUAGES, LANGUAGE_LABELS, type Language } from "@/i18n";
import { useLanguage } from "@/lib/useLanguage";
import { useTheme, type Theme } from "@/lib/useTheme";
import type { ProcessView } from "@/lib/types";
import { Button } from "@/registry/default/ui/button";
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
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // Hidden file input triggered by the import button — keeps the native file
  // picker without rendering its default look.
  const fileRef = useRef<HTMLInputElement>(null);
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
      await Promise.all(items.map((item) => saveImportedProcess(item)));
      onToast(t("settings.importDone", { count: items.length }));
    } catch (err) {
      onToast(err instanceof Error ? err.message : String(err), true);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
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
                <TabsTab value="data">
                  <DatabaseIcon aria-hidden="true" />
                  {t("settings.tabData")}
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
          </Tabs>
          </div>
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  );
}
