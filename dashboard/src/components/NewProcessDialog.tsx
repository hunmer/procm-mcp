import { useState } from "react";
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
import { PlusIcon } from "lucide-react";
import { parseEnvs, startProcess } from "@/lib/api";

interface NewProcessDialogProps {
  onStarted: (id: string) => void;
  onError: (message: string) => void;
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
  const [envs, setEnvs] = useState("");

  function reset() {
    setName("");
    setScript("");
    setArgs("");
    setCwd("");
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
        <form className="contents" onSubmit={handleSubmit}>
          <DialogPanel>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="f-name">Name (optional)</FieldLabel>
                <Input
                  id="f-name"
                  placeholder="my-server"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="f-script">Script *</FieldLabel>
                <Input
                  id="f-script"
                  placeholder="npm"
                  value={script}
                  onChange={(e) => setScript(e.target.value)}
                  required
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
                  onChange={(e) => setArgs(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="f-cwd">Working directory *</FieldLabel>
                <Input
                  id="f-cwd"
                  placeholder="/path/to/project"
                  value={cwd}
                  onChange={(e) => setCwd(e.target.value)}
                  required
                />
              </Field>
            </div>
            <Field className="mt-4">
              <FieldLabel htmlFor="f-envs">
                Environment variables (KEY=VALUE per line)
              </FieldLabel>
              <Textarea
                id="f-envs"
                placeholder={"NODE_ENV=development\nPORT=3000"}
                value={envs}
                onChange={(e) => setEnvs(e.target.value)}
              />
              <FieldDescription>
                Optional. One variable per line, written as KEY=VALUE.
              </FieldDescription>
            </Field>
          </DialogPanel>
          <DialogFooter>
            <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
            <Button type="submit" loading={submitting}>
              Start process
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
