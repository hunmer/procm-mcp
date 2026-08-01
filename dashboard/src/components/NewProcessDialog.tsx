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
import { PlusIcon, ZapIcon } from "lucide-react";
import { parseEnvs, startProcess, stringifyEnvs } from "@/lib/api";
import { applyPreset, useProcessPresets } from "@/lib/presets";
import type { Favorite } from "@/lib/favorites";
import { makeFavoriteId } from "@/lib/favorites";
import type { ProcessView } from "@/lib/types";

interface NewProcessDialogProps {
  onStarted: (id: string) => void;
  onError: (message: string) => void;
}

// Optional controlled "view details" mode. When `viewProcess` is provided the
// dialog opens read-only, pre-filled with that process's fields — reused from
// the new-process form so the two share one layout.
export interface ProcessDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  viewProcess: ProcessView | null;
}

// coss form-in-dialog invariant: DialogHeader stays OUTSIDE the form;
// <form className="contents"> wraps DialogPanel + DialogFooter so the popup's
// flex column still treats them as direct layout sections.
export function NewProcessDialog({ onStarted, onError }: NewProcessDialogProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState("");
  const [script, setScript] = useState("");
  const [args, setArgs] = useState("");
  const [cwd, setCwd] = useState("");
  const [desc, setDesc] = useState("");
  const [envs, setEnvs] = useState("");

  const presets = useProcessPresets();

  function reset() {
    setName("");
    setScript("");
    setArgs("");
    setCwd("");
    setDesc("");
    setEnvs("");
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!script.trim() || !cwd.trim()) {
      onError(t("dialogs.newProcess.validationError"));
      return;
    }
    setSubmitting(true);
    try {
      const r = await startProcess({
        name: name.trim() || undefined,
        script: script.trim(),
        args: args.trim() ? args.trim().split(/\s+/) : [],
        cwd: cwd.trim(),
        envs: parseEnvs(envs),
        desc: desc.trim() || undefined,
      });
      reset();
      setOpen(false);
      onStarted(r.id);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <PlusIcon />
        {t("header.newProcess")}
      </DialogTrigger>
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>{t("dialogs.newProcess.title")}</DialogTitle>
          <DialogDescription>
            {t("dialogs.newProcess.description")}
          </DialogDescription>
        </DialogHeader>
        <ProcessForm
          name={name}
          script={script}
          args={args}
          cwd={cwd}
          desc={desc}
          envs={envs}
          setters={{ setName, setScript, setArgs, setCwd, setDesc, setEnvs }}
          presets={presets}
          submitting={submitting}
          onSubmit={handleSubmit}
        />
      </DialogPopup>
    </Dialog>
  );
}

// Read-only details dialog. Reuses the same form layout but pre-fills from a
// process and disables submission.
export function ProcessDetailsDialog({
  open,
  onOpenChange,
  viewProcess,
}: ProcessDetailsDialogProps) {
  const { t } = useTranslation();
  const [fields, setFields] = useState({
    name: "",
    script: "",
    args: "",
    cwd: "",
    desc: "",
    envs: "",
  });

  // Sync the form from the process whenever the dialog is opened to a new one.
  useEffect(() => {
    if (open && viewProcess) {
      setFields({
        name: viewProcess.name,
        script: viewProcess.script,
        args: viewProcess.args.join(" "),
        cwd: viewProcess.cwd,
        desc: viewProcess.desc ?? "",
        envs: "", // envs are not exposed in the public view by design
      });
    }
  }, [open, viewProcess]);

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
          setters={{
            setName: () => {},
            setScript: () => {},
            setArgs: () => {},
            setCwd: () => {},
            setDesc: () => {},
            setEnvs: () => {},
          }}
          presets={[]}
          readOnly
          submitting={false}
          onSubmit={(e) => e.preventDefault()}
        />
      </DialogPopup>
    </Dialog>
  );
}

// Favorite editor dialog. Reuses the same ProcessForm layout as the new-process
// and details dialogs (per the task: "复用编辑对话框"), and adds a Category
// field. Operates in two modes:
//   - "create": seeded from a live process (`seedProcess`) → saves a NEW
//     favorite via onCreate. Triggered by the star toggle on a process row.
//   - "edit": seeded from an existing favorite (`seedFavorite`) → updates it
//     in place via onEdit. Triggered from the favorites cards.
export interface FavoriteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Exactly one of these is set when opened.
  seedProcess?: ProcessView | null;
  seedFavorite?: Favorite | null;
  onCreate: (fav: Favorite) => void;
  onEdit: (fav: Favorite) => void;
}

export function FavoriteDialog({
  open,
  onOpenChange,
  seedProcess,
  seedFavorite,
  onCreate,
  onEdit,
}: FavoriteDialogProps) {
  const { t } = useTranslation();
  const isEdit = seedFavorite != null;
  const [fields, setFields] = useState({
    name: "",
    script: "",
    args: "",
    cwd: "",
    desc: "",
    envs: "",
    category: "",
  });

  // Seed the form whenever the dialog opens to a fresh target.
  useEffect(() => {
    if (!open) return;
    if (seedFavorite) {
      setFields({
        name: seedFavorite.name ?? "",
        script: seedFavorite.script,
        args: seedFavorite.args.join(" "),
        cwd: seedFavorite.cwd,
        desc: seedFavorite.desc ?? "",
        envs: stringifyEnvs(seedFavorite.envs),
        category: seedFavorite.category ?? "",
      });
    } else if (seedProcess) {
      // Favoriting a process: envs aren't exposed by the public API, so they
      // start empty (the user can re-add them before saving).
      setFields({
        name: seedProcess.name,
        script: seedProcess.script,
        args: seedProcess.args.join(" "),
        cwd: seedProcess.cwd,
        desc: seedProcess.desc ?? "",
        envs: "",
        category: "",
      });
    }
  }, [open, seedFavorite, seedProcess]);

  function set<K extends keyof typeof fields>(key: K, v: string) {
    setFields((f) => ({ ...f, [key]: v }));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!fields.script.trim() || !fields.cwd.trim()) return;
    const fav: Favorite = {
      id: seedFavorite?.id ?? makeFavoriteId(),
      name: fields.name.trim() || undefined,
      desc: fields.desc.trim() || undefined,
      script: fields.script.trim(),
      args: fields.args.trim() ? fields.args.trim().split(/\s+/) : [],
      cwd: fields.cwd.trim(),
      envs: parseEnvs(fields.envs),
      category: fields.category.trim(),
      createdAt: seedFavorite?.createdAt ?? Date.now(),
    };
    if (isEdit) onEdit(fav);
    else onCreate(fav);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t("dialogs.favorite.titleEdit") : t("dialogs.favorite.titleAdd")}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? t("dialogs.favorite.descEdit")
              : t("dialogs.favorite.descAdd")}
          </DialogDescription>
        </DialogHeader>
        <ProcessForm
          name={fields.name}
          script={fields.script}
          args={fields.args}
          cwd={fields.cwd}
          desc={fields.desc}
          envs={fields.envs}
          category={fields.category}
          setters={{
            setName: (v) => set("name", v),
            setScript: (v) => set("script", v),
            setArgs: (v) => set("args", v),
            setCwd: (v) => set("cwd", v),
            setDesc: (v) => set("desc", v),
            setEnvs: (v) => set("envs", v),
            setCategory: (v) => set("category", v),
          }}
          presets={[]}
          submitting={false}
          onSubmit={handleSubmit}
        />
      </DialogPopup>
    </Dialog>
  );
}

// Shared form body for both new-process and read-only detail views. When
// `category` is provided it also renders the category input — used by the
// favorite editor (see FavoriteDialog) which groups saved launches.
interface ProcessFormProps {
  name: string;
  script: string;
  args: string;
  cwd: string;
  desc: string;
  envs: string;
  category?: string;
  setters: {
    setName: (v: string) => void;
    setScript: (v: string) => void;
    setArgs: (v: string) => void;
    setCwd: (v: string) => void;
    setDesc: (v: string) => void;
    setEnvs: (v: string) => void;
    setCategory?: (v: string) => void;
  };
  presets: ReturnType<typeof useProcessPresets>;
  readOnly?: boolean;
  submitting: boolean;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}

function ProcessForm({
  name,
  script,
  args,
  cwd,
  desc,
  envs,
  category,
  setters,
  presets,
  readOnly,
  submitting,
  onSubmit,
}: ProcessFormProps) {
  const { t } = useTranslation();
  return (
    <form className="contents" onSubmit={onSubmit}>
      <DialogPanel>
        {/* Quick-fill presets: click to populate the form with demo
            commands that visibly exercise the live log push. */}
        {!readOnly && presets.length > 0 && (
          <div className="mb-4">
            <div className="text-muted-foreground mb-2 flex items-center gap-1.5 text-xs">
              <ZapIcon className="size-3.5" />
              {t("dialogs.form.presets")}
            </div>
            <div className="flex flex-wrap gap-2">
              {presets.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  title={t(`presets.${p.id}.description`)}
                  onClick={() => applyPreset(p, setters)}
                  className="bg-muted hover:bg-accent inline-flex items-center rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors"
                >
                  {t(`presets.${p.id}.label`)}
                </button>
              ))}
            </div>
          </div>
        )}

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
        {/* Category only renders for the favorite editor (setters.setCategory
            is wired only there). It's the grouping key for the favorites view. */}
        {setters.setCategory && (
          <Field className="mt-4">
            <FieldLabel htmlFor="f-category">{t("dialogs.form.categoryLabel")}</FieldLabel>
            <Input
              id="f-category"
              placeholder={t("dialogs.form.categoryPlaceholder")}
              value={category ?? ""}
              onChange={(e) => setters.setCategory!(e.target.value)}
              readOnly={readOnly}
            />
            <FieldDescription>
              {t("dialogs.form.categoryHelp")}
            </FieldDescription>
          </Field>
        )}
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
      </DialogPanel>
      <DialogFooter>
        <DialogClose render={<Button variant="ghost" />}>
          {readOnly ? t("common.close") : t("common.cancel")}
        </DialogClose>
        {!readOnly && (
          <Button type="submit" loading={submitting}>
            {t("dialogs.newProcess.submit")}
          </Button>
        )}
      </DialogFooter>
    </form>
  );
}
