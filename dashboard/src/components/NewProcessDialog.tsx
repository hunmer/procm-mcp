import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "@/registry/default/ui/dialog";
import { Button } from "@/registry/default/ui/button";
import { Input } from "@/registry/default/ui/input";
import { Textarea } from "@/registry/default/ui/textarea";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@/registry/default/ui/field";
import {
  Autocomplete,
  AutocompleteEmpty,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
  AutocompletePopup,
} from "@/registry/default/ui/autocomplete";
import { Checkbox } from "@/registry/default/ui/checkbox";
import { PlusIcon, SearchIcon } from "lucide-react";
import { parseEnvs, saveImportedProcess, startProcess, updateProcess } from "@/lib/api";
import type { ProcessView } from "@/lib/types";

interface NewProcessDialogProps {
  onStarted: (id: string) => void;
  // Fired when the record was created without starting (checkbox unticked).
  onCreated?: (id: string) => void;
  onError: (message: string) => void;
  // Controlled mode: when open/onOpenChange are provided the dialog is driven
  // from outside (e.g. the header "+" menu) and the built-in trigger button
  // is not rendered.
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  // Group pre-filled into the form when the dialog opens (e.g. the group the
  // "+" button in a group header was clicked on).
  defaultGroup?: string;
  // Existing group labels offered in the group combobox.
  groupOptions?: string[];
}

// Optional controlled "edit" mode. When `viewProcess` is provided the dialog
// opens pre-filled with that process's fields; saving merges the edited fields
// back into the process record (a running process isn't restarted — the new
// launch fields apply on the next restart).
export interface ProcessDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  viewProcess: ProcessView | null;
  onToast: (message: string, isError?: boolean) => void;
  // Existing group labels offered in the group combobox.
  groupOptions?: string[];
}

// coss form-in-dialog invariant: DialogHeader stays OUTSIDE the form;
// <form className="contents"> wraps DialogPanel + DialogFooter so the popup's
// flex column still treats them as direct layout sections.
export function NewProcessDialog({
  onStarted,
  onCreated,
  onError,
  open: openProp,
  onOpenChange,
  defaultGroup,
  groupOptions,
}: NewProcessDialogProps) {
  const { t } = useTranslation();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const [submitting, setSubmitting] = useState(false);
  // Default off: submit only persists a stopped record; ticking the checkbox
  // switches the dialog to "start" wording and launches on submit.
  const [startAfterCreate, setStartAfterCreate] = useState(false);
  const [name, setName] = useState("");
  const [script, setScript] = useState("");
  const [args, setArgs] = useState("");
  const [cwd, setCwd] = useState("");
  const [desc, setDesc] = useState("");
  const [envs, setEnvs] = useState("");
  const [port, setPort] = useState("");
  const [group, setGroup] = useState("");

  // Re-seed the group field from defaultGroup on every open so a group
  // header's "+" always pre-fills that group, and a plain reopen clears it.
  // The run checkbox also resets to the create-only default each time.
  useEffect(() => {
    if (open) {
      setGroup(defaultGroup ?? "");
      setStartAfterCreate(false);
    }
  }, [open, defaultGroup]);

  function reset() {
    setName("");
    setScript("");
    setArgs("");
    setCwd("");
    setDesc("");
    setEnvs("");
    setPort("");
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!script.trim() || !cwd.trim()) {
      onError(t("dialogs.newProcess.validationError"));
      return;
    }
    const portTrimmed = port.trim();
    const portNum = portTrimmed === "" ? undefined : Number(portTrimmed);
    if (
      portNum !== undefined &&
      (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535)
    ) {
      onError(t("dialogs.newProcess.portValidationError"));
      return;
    }
    setSubmitting(true);
    try {
      const body = {
        name: name.trim() || undefined,
        script: script.trim(),
        args: args.trim() ? args.trim().split(/\s+/) : [],
        cwd: cwd.trim(),
        envs: parseEnvs(envs),
        desc: desc.trim() || undefined,
        port: portNum,
        group: group.trim() || undefined,
      };
      // Ticked: launch now (same as before). Unticked: persist a stopped
      // record via the import route so it appears in the list ready to start.
      const r = startAfterCreate
        ? await startProcess(body)
        : await saveImportedProcess(body);
      reset();
      setOpen(false);
      if (startAfterCreate) onStarted(r.id);
      else onCreated?.(r.id);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {openProp === undefined && (
        <DialogTrigger
          render={<Button variant="outline" size="icon" />}
          aria-label={t("header.newProcess")}
          title={t("header.newProcess")}
        >
          <PlusIcon />
        </DialogTrigger>
      )}
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>
            {startAfterCreate
              ? t("dialogs.newProcess.title")
              : t("dialogs.newProcess.createTitle")}
          </DialogTitle>
          <DialogDescription>
            {startAfterCreate
              ? t("dialogs.newProcess.description")
              : t("dialogs.newProcess.createDescription")}
          </DialogDescription>
        </DialogHeader>
        <ProcessForm
          name={name}
          script={script}
          args={args}
          cwd={cwd}
          desc={desc}
          envs={envs}
          port={port}
          setters={{ setName, setScript, setArgs, setCwd, setDesc, setEnvs, setPort }}
          group={group}
          setGroup={setGroup}
          groupOptions={groupOptions ?? []}
          startAfterCreate={startAfterCreate}
          setStartAfterCreate={setStartAfterCreate}
          submitting={submitting}
          submitLabel={
            startAfterCreate
              ? t("dialogs.newProcess.submit")
              : t("dialogs.newProcess.createSubmit")
          }
          onSubmit={handleSubmit}
        />
      </DialogPopup>
    </Dialog>
  );
}

// Edit-process dialog. Reuses the same form layout as the new-process dialog,
// pre-filled from the process; submit merges the edits into its record.
export function ProcessDetailsDialog({
  open,
  onOpenChange,
  viewProcess,
  onToast,
  groupOptions,
}: ProcessDetailsDialogProps) {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  const [fields, setFields] = useState({
    name: "",
    script: "",
    args: "",
    cwd: "",
    desc: "",
    envs: "",
    port: "",
    group: "",
  });

  function set<K extends keyof typeof fields>(key: K, v: string) {
    setFields((f) => ({ ...f, [key]: v }));
  }

  // Sync the form from the process whenever the dialog is opened to a new one.
  useEffect(() => {
    if (open && viewProcess) {
      setFields({
        name: viewProcess.name,
        script: viewProcess.script,
        args: viewProcess.args.join(" "),
        cwd: viewProcess.cwd,
        desc: viewProcess.desc ?? "",
        envs: "", // envs are not exposed in the public view by design; empty = keep current
        port: viewProcess.port ? String(viewProcess.port) : "",
        group: viewProcess.group ?? "",
      });
    }
  }, [open, viewProcess]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const script = fields.script.trim();
    const cwd = fields.cwd.trim();
    if (!viewProcess || !script || !cwd) {
      onToast(t("dialogs.newProcess.validationError"), true);
      return;
    }
    const portTrimmed = fields.port.trim();
    const portNum = portTrimmed === "" ? null : Number(portTrimmed);
    if (
      portNum !== null &&
      (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535)
    ) {
      onToast(t("dialogs.newProcess.portValidationError"), true);
      return;
    }
    const envsText = fields.envs.trim();
    setSubmitting(true);
    try {
      await updateProcess(viewProcess.id, {
        name: fields.name.trim() || undefined,
        script,
        args: fields.args.trim() ? fields.args.trim().split(/\s+/) : [],
        cwd,
        desc: fields.desc.trim() || null,
        port: portNum,
        envs: envsText ? parseEnvs(envsText) : undefined,
        group: fields.group.trim() || null,
      });
      onOpenChange(false);
    } catch (err) {
      onToast(err instanceof Error ? err.message : String(err), true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>{t("dialogs.details.title")}</DialogTitle>
          <DialogDescription>
            {viewProcess
              ? t("dialogs.details.description", { name: viewProcess.name, id: viewProcess.id })
              : ""}
          </DialogDescription>
        </DialogHeader>
        <ProcessForm
          name={fields.name}
          script={fields.script}
          args={fields.args}
          cwd={fields.cwd}
          desc={fields.desc}
          envs={fields.envs}
          port={fields.port}
          setters={{
            setName: (v) => set("name", v),
            setScript: (v) => set("script", v),
            setArgs: (v) => set("args", v),
            setCwd: (v) => set("cwd", v),
            setDesc: (v) => set("desc", v),
            setEnvs: (v) => set("envs", v),
            setPort: (v) => set("port", v),
          }}
          group={fields.group}
          setGroup={(v) => set("group", v)}
          groupOptions={groupOptions ?? []}
          submitting={submitting}
          submitLabel={t("common.save")}
          onSubmit={handleSubmit}
        />
      </DialogPopup>
    </Dialog>
  );
}

// Shared form body for new-process and read-only detail views.
interface ProcessFormProps {
  name: string;
  script: string;
  args: string;
  cwd: string;
  desc: string;
  envs: string;
  port: string;
  setters: {
    setName: (v: string) => void;
    setScript: (v: string) => void;
    setArgs: (v: string) => void;
    setCwd: (v: string) => void;
    setDesc: (v: string) => void;
    setEnvs: (v: string) => void;
    setPort: (v: string) => void;
  };
  // Target group. Only rendered when `setGroup` is provided (the new-process
  // dialog offers a group picker; the details dialog keeps its current fields).
  group?: string;
  setGroup?: (v: string) => void;
  groupOptions?: string[];
  // "Run after creation" checkbox state. Only rendered when
  // `setStartAfterCreate` is provided (the new-process dialog); the details
  // dialog keeps its plain save behavior.
  startAfterCreate?: boolean;
  setStartAfterCreate?: (v: boolean) => void;
  readOnly?: boolean;
  submitting: boolean;
  // Override for the submit button label. Defaults to the new-process
  // "Start process" string; the favorite editor passes Edit/Save instead so
  // the shared form's button matches the dialog it lives in.
  submitLabel?: string;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}

function ProcessForm({
  name,
  script,
  args,
  cwd,
  desc,
  envs,
  port,
  setters,
  group,
  setGroup,
  groupOptions,
  startAfterCreate,
  setStartAfterCreate,
  readOnly,
  submitting,
  submitLabel,
  onSubmit,
}: ProcessFormProps) {
  const { t } = useTranslation();
  // Combobox items are {value,label} objects so selecting one fills the
  // input with the label automatically (Base UI single-select behavior).
  type GroupItem = { value: string; label: string };
  const groupItems: GroupItem[] = (groupOptions ?? []).map((g) => ({
    value: g,
    label: g,
  }));
  return (
    <form className="contents" onSubmit={onSubmit}>
      <DialogPanel>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="f-name">{t("dialogs.form.nameLabel")}</FieldLabel>
            <Input
              id="f-name"
              placeholder={t("dialogs.form.namePlaceholder")}
              value={name}
              onChange={(e) => setters.setName(e.target.value)}
              readOnly={readOnly}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="f-script">{t("dialogs.form.scriptLabel")}</FieldLabel>
            <Input
              id="f-script"
              placeholder={t("dialogs.form.scriptPlaceholder")}
              value={script}
              onChange={(e) => setters.setScript(e.target.value)}
              required={!readOnly}
              readOnly={readOnly}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="f-args">
              {t("dialogs.form.argsLabel")}
            </FieldLabel>
            <Input
              id="f-args"
              placeholder={t("dialogs.form.argsPlaceholder")}
              value={args}
              onChange={(e) => setters.setArgs(e.target.value)}
              readOnly={readOnly}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="f-cwd">{t("dialogs.form.cwdLabel")}</FieldLabel>
            <Input
              id="f-cwd"
              placeholder={t("dialogs.form.cwdPlaceholder")}
              value={cwd}
              onChange={(e) => setters.setCwd(e.target.value)}
              required={!readOnly}
              readOnly={readOnly}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="f-port">
              {t("dialogs.form.portLabel")}
            </FieldLabel>
            <Input
              id="f-port"
              type="number"
              min={1}
              max={65535}
              placeholder={t("dialogs.form.portPlaceholder")}
              value={port}
              onChange={(e) => setters.setPort(e.target.value)}
              readOnly={readOnly}
            />
            {!readOnly && (
              <FieldDescription>
                {t("dialogs.form.portHelp")}
              </FieldDescription>
            )}
          </Field>
          {setGroup && !readOnly && (
            <Field>
              <FieldLabel htmlFor="f-group">
                {t("dialogs.form.groupLabel")}
              </FieldLabel>
              {/* p-autocomplete-5 (coss): the input itself is the control —
                  free text IS the value; picking an item fills it. Replaces
                  the earlier trigger-style Combobox: with the search input
                  inside the popup, Base UI treats the text as a transient
                  filter and clears it when the popup closes, so a typed or
                  picked group never stuck. */}
              <Autocomplete
                items={groupItems}
                value={group}
                onValueChange={(v) => setGroup(v)}
              >
                <AutocompleteInput
                  id="f-group"
                  placeholder={t("dialogs.form.groupPlaceholder")}
                  startAddon={<SearchIcon />}
                />
                <AutocompletePopup aria-label={t("dialogs.form.groupLabel")}>
                  <AutocompleteEmpty>
                    {t("dialogs.form.groupEmpty")}
                  </AutocompleteEmpty>
                  <AutocompleteList>
                    {(item: GroupItem) => (
                      <AutocompleteItem key={item.value} value={item}>
                        {item.label}
                      </AutocompleteItem>
                    )}
                  </AutocompleteList>
                </AutocompletePopup>
              </Autocomplete>
              <FieldDescription>
                {t("dialogs.form.groupHelp")}
              </FieldDescription>
            </Field>
          )}
        </div>
        <Field className="mt-4">
          <FieldLabel htmlFor="f-desc">{t("dialogs.form.descLabel")}</FieldLabel>
          <Input
            id="f-desc"
            placeholder={t("dialogs.form.descPlaceholder")}
            value={desc}
            onChange={(e) => setters.setDesc(e.target.value)}
            readOnly={readOnly}
          />
          <FieldDescription>
            {t("dialogs.form.descHelp")}
          </FieldDescription>
        </Field>
        <Field className="mt-4">
          <FieldLabel htmlFor="f-envs">
            {t("dialogs.form.envsLabel")}
          </FieldLabel>
          <Textarea
            id="f-envs"
            placeholder={t("dialogs.form.envsPlaceholder")}
            value={envs}
            onChange={(e) => setters.setEnvs(e.target.value)}
            readOnly={readOnly}
            disabled={readOnly}
          />
          {!readOnly && (
            <FieldDescription>
              {t("dialogs.form.envsHelp")}
            </FieldDescription>
          )}
        </Field>
        {setStartAfterCreate && !readOnly && (
          <Field className="mt-4">
            <div className="flex items-center gap-2">
              <Checkbox
                id="f-run-after-create"
                checked={startAfterCreate ?? false}
                onCheckedChange={(checked) =>
                  setStartAfterCreate(checked === true)
                }
              />
              <label
                htmlFor="f-run-after-create"
                className="text-sm select-none"
              >
                {t("dialogs.form.runAfterCreate")}
              </label>
            </div>
          </Field>
        )}
      </DialogPanel>
      <DialogFooter>
        <DialogClose render={<Button variant="ghost" />}>
          {readOnly ? t("common.close") : t("common.cancel")}
        </DialogClose>
        {!readOnly && (
          <Button type="submit" loading={submitting}>
            {submitLabel ?? t("dialogs.newProcess.submit")}
          </Button>
        )}
      </DialogFooter>
    </form>
  );
}
