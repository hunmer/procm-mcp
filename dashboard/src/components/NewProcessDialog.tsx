import { useEffect, useState } from "react";
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
import { parseEnvs, startProcess } from "@/lib/api";
import { applyPreset, useProcessPresets } from "@/lib/presets";
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
      onError("script and working directory are required");
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
        New process
      </DialogTrigger>
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>Start a process</DialogTitle>
          <DialogDescription>
            The dashboard is a human-driven localhost UI. Starting a process
            here bypasses the allow-x gate, equivalent to running the command
            yourself in a terminal.
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
          <DialogTitle>Process details</DialogTitle>
          <DialogDescription>
            {viewProcess
              ? `${viewProcess.name} · ${viewProcess.id}`
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

// Shared form body for both new-process and read-only detail views.
interface ProcessFormProps {
  name: string;
  script: string;
  args: string;
  cwd: string;
  desc: string;
  envs: string;
  setters: {
    setName: (v: string) => void;
    setScript: (v: string) => void;
    setArgs: (v: string) => void;
    setCwd: (v: string) => void;
    setDesc: (v: string) => void;
    setEnvs: (v: string) => void;
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
  setters,
  presets,
  readOnly,
  submitting,
  onSubmit,
}: ProcessFormProps) {
  return (
    <form className="contents" onSubmit={onSubmit}>
      <DialogPanel>
        {/* Quick-fill presets: click to populate the form with demo
            commands that visibly exercise the live log push. */}
        {!readOnly && presets.length > 0 && (
          <div className="mb-4">
            <div className="text-muted-foreground mb-2 flex items-center gap-1.5 text-xs">
              <ZapIcon className="size-3.5" />
              Presets
            </div>
            <div className="flex flex-wrap gap-2">
              {presets.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  title={p.description}
                  onClick={() => applyPreset(p, setters)}
                  className="bg-muted hover:bg-accent inline-flex items-center rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="f-name">Name (optional)</FieldLabel>
            <Input
              id="f-name"
              placeholder="my-server"
              value={name}
              onChange={(e) => setters.setName(e.target.value)}
              readOnly={readOnly}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="f-script">Script *</FieldLabel>
            <Input
              id="f-script"
              placeholder="npm"
              value={script}
              onChange={(e) => setters.setScript(e.target.value)}
              required={!readOnly}
              readOnly={readOnly}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="f-args">
              Args (space-separated)
            </FieldLabel>
            <Input
              id="f-args"
              placeholder="run dev"
              value={args}
              onChange={(e) => setters.setArgs(e.target.value)}
              readOnly={readOnly}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="f-cwd">Working directory *</FieldLabel>
            <Input
              id="f-cwd"
              placeholder="/path/to/project"
              value={cwd}
              onChange={(e) => setters.setCwd(e.target.value)}
              required={!readOnly}
              readOnly={readOnly}
            />
          </Field>
        </div>
        <Field className="mt-4">
          <FieldLabel htmlFor="f-desc">Description (optional)</FieldLabel>
          <Input
            id="f-desc"
            placeholder="What this process is for"
            value={desc}
            onChange={(e) => setters.setDesc(e.target.value)}
            readOnly={readOnly}
          />
          <FieldDescription>
            Shown in the process list to help identify it.
          </FieldDescription>
        </Field>
        <Field className="mt-4">
          <FieldLabel htmlFor="f-envs">
            Environment variables (KEY=VALUE per line)
          </FieldLabel>
          <Textarea
            id="f-envs"
            placeholder={"NODE_ENV=development\nPORT=3000"}
            value={envs}
            onChange={(e) => setters.setEnvs(e.target.value)}
            readOnly={readOnly}
            disabled={readOnly}
          />
          {!readOnly && (
            <FieldDescription>
              Optional. One variable per line, written as KEY=VALUE.
            </FieldDescription>
          )}
        </Field>
      </DialogPanel>
      <DialogFooter>
        <DialogClose render={<Button variant="ghost" />}>
          {readOnly ? "Close" : "Cancel"}
        </DialogClose>
        {!readOnly && (
          <Button type="submit" loading={submitting}>
            Start process
          </Button>
        )}
      </DialogFooter>
    </form>
  );
}
