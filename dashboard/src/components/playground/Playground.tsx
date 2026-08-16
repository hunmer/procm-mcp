import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { CheckIcon, CopyIcon } from "lucide-react";
import { Badge } from "@/registry/default/ui/badge";
import { Button } from "@/registry/default/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/registry/default/ui/field";
import { Form } from "@/registry/default/ui/form";
import { Input } from "@/registry/default/ui/input";
import { Textarea } from "@/registry/default/ui/textarea";
import {
  Select,
  SelectIcon,
  SelectItem,
  SelectItemIndicator,
  SelectItemText,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@/registry/default/ui/select";
import { cn } from "@/registry/default/lib/utils";
import { JsonViewer } from "@/components/JsonViewer";
import { parseEnvs } from "@/lib/api";
import {
  PLAY_ENDPOINTS,
  PLAY_GROUPS,
  fieldsOf,
  type HttpMethod,
  type PlayEndpoint,
  type PlayField,
} from "./catalog";

// API playground: the left rail lists the server's HTTP endpoints grouped by
// category; picking one renders its inputs on the right (p-form-2 style —
// zod-validated Form whose `errors` drive each Field's FieldError) and sends
// the request straight back to the same origin.

const METHOD_VARIANT: Record<HttpMethod, "success" | "info" | "destructive" | "warning"> = {
  GET: "success",
  POST: "info",
  DELETE: "destructive",
  PATCH: "warning",
};

interface PlayResponse {
  status: number;
  ok: boolean;
  data: unknown;
  ms: number;
}

// The exact request the last Send produced, so the response panel can offer an
// equivalent curl command for it.
interface PlayRequest {
  method: HttpMethod;
  url: string; // resolved path + query string, relative to the origin
  body?: string; // serialized JSON body, when the endpoint has body fields
}

// Quote a token for POSIX shells (bash/zsh/sh): single quotes with the
// standard `'\''` escape, robust against any metacharacter inside the URL or
// JSON body.
function quotePosix(token: string): string {
  return `'${token.replace(/'/g, "'\\''")}'`;
}

// Quote a token for cmd.exe: double quotes with embedded `"` escaped as `\"` —
// same strategy as the backend's copy-command quoting in src/http-server.ts.
function quoteWin(token: string): string {
  return `"${token.replace(/"/g, '\\"')}"`;
}

function toCurl(req: PlayRequest): string {
  // Match the quoting style to the browser's OS so the copied line runs when
  // pasted into the user's local terminal: cmd.exe on Windows, POSIX shell
  // elsewhere.
  const win = navigator.userAgent.includes("Windows");
  const q = win ? quoteWin : quotePosix;
  const parts = ["curl"];
  if (req.method !== "GET") parts.push(`-X ${req.method}`);
  parts.push(q(`${window.location.origin}${req.url}`));
  if (req.body !== undefined) {
    parts.push(win ? '-H "Content-Type: application/json"' : "-H 'Content-Type: application/json'");
    parts.push(`--data ${q(req.body)}`);
  }
  return parts.join(" ");
}

function initialValues(ep: PlayEndpoint): Record<string, string> {
  const values: Record<string, string> = {};
  for (const f of fieldsOf(ep)) values[f.name] = f.defaultValue ?? "";
  return values;
}

// zod schema built from the endpoint's field list: required fields must be
// non-empty; number fields (when filled) must parse as finite numbers.
function buildSchema(fields: PlayField[], requiredMsg: string, numberMsg: string) {
  const shape: Record<string, z.ZodType> = {};
  for (const f of fields) {
    let s = z.string().trim();
    if (f.required) s = s.min(1, { message: requiredMsg });
    if (f.type === "number") {
      s = s.refine((v) => v === "" || Number.isFinite(Number(v)), {
        message: numberMsg,
      });
    }
    shape[f.name] = s;
  }
  return z.object(shape);
}

// Serialize one filled field into its JSON body value, applying the field's
// type conversion. Empty values are omitted so optional fields never override.
function bodyValue(f: PlayField, raw: string): unknown {
  const v = raw.trim();
  switch (f.type) {
    case "number":
      return v === "" ? undefined : Number(v);
    case "boolean":
      return v === "" ? undefined : v === "true";
    case "array":
      return v === "" ? undefined : v.split(/\s+/);
    case "lines":
      return v === "" ? undefined : v.split("\n").map((l) => l.trim()).filter(Boolean);
    case "envs": {
      const envs = parseEnvs(raw);
      return Object.keys(envs).length > 0 ? envs : undefined;
    }
    default:
      return v === "" ? undefined : v;
  }
}

function MethodBadge({ method }: { method: HttpMethod }) {
  return (
    <Badge variant={METHOD_VARIANT[method]} className="font-mono text-[10px] uppercase">
      {method}
    </Badge>
  );
}

// Highlight `:param` segments in a path template.
function PathTemplate({ path }: { path: string }) {
  return (
    <>
      {path.split(/(:[a-zA-Z]+)/).map((part, i) =>
        part.startsWith(":") ? (
          <span key={i} className="text-warning-foreground font-semibold">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}

export function Playground() {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState(PLAY_ENDPOINTS[0].id);
  const endpoint = useMemo(
    () => PLAY_ENDPOINTS.find((e) => e.id === selectedId) ?? PLAY_ENDPOINTS[0],
    [selectedId],
  );
  const [values, setValues] = useState<Record<string, string>>(() =>
    initialValues(PLAY_ENDPOINTS[0]),
  );
  const [errors, setErrors] = useState<Record<string, string | string[]>>({});
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<PlayResponse | null>(null);
  const [lastRequest, setLastRequest] = useState<PlayRequest | null>(null);

  const schema = useMemo(
    () =>
      buildSchema(
        fieldsOf(endpoint),
        t("playground.required"),
        t("playground.invalidNumber"),
      ),
    [endpoint, t],
  );

  function selectEndpoint(id: string) {
    const next = PLAY_ENDPOINTS.find((e) => e.id === id);
    if (!next) return;
    setSelectedId(id);
    setValues(initialValues(next));
    setErrors({});
    setResponse(null);
    setLastRequest(null);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      // p-form-2 flow: flatten zod issues into per-field messages the Form
      // hands to each Field's FieldError.
      const { fieldErrors } = z.flattenError(parsed.error);
      const cleaned: Record<string, string | string[]> = {};
      for (const [k, v] of Object.entries(fieldErrors)) {
        if (v != null && v.length > 0) cleaned[k] = v;
      }
      setErrors(cleaned);
      return;
    }
    setErrors({});
    setLoading(true);
    const startedAt = performance.now();

    let url = endpoint.path;
    for (const p of endpoint.pathParams) {
      url = url.replace(`:${p.name}`, encodeURIComponent((values[p.name] ?? "").trim()));
    }
    const qs = new URLSearchParams();
    for (const q of endpoint.queryParams) {
      const v = (values[q.name] ?? "").trim();
      if (v !== "") qs.set(q.name, v);
    }
    const queryString = qs.toString();
    if (queryString) url += `?${queryString}`;

    let body: Record<string, unknown> | undefined;
    if (endpoint.bodyFields.length > 0) {
      body = {};
      for (const f of endpoint.bodyFields) {
        const v = bodyValue(f, values[f.name] ?? "");
        if (v !== undefined) body[f.name] = v;
      }
    }

    setLastRequest({
      method: endpoint.method,
      url,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    try {
      const res = await fetch(url, {
        method: endpoint.method,
        headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      let data: unknown = text;
      try {
        data = JSON.parse(text);
      } catch {
        // non-JSON response: show the raw text
      }
      setResponse({
        status: res.status,
        ok: res.ok,
        data,
        ms: Math.round(performance.now() - startedAt),
      });
    } catch (err) {
      setResponse({
        status: 0,
        ok: false,
        data: err instanceof Error ? err.message : String(err),
        ms: Math.round(performance.now() - startedAt),
      });
    } finally {
      setLoading(false);
    }
  }

  const sections: { key: string; fields: PlayField[] }[] = [
    { key: "sectionPath", fields: endpoint.pathParams },
    { key: "sectionQuery", fields: endpoint.queryParams },
    { key: "sectionBody", fields: endpoint.bodyFields },
  ];

  return (
    // Container queries drive the responsive split: wide enough (>= 64rem)
    // the response gets its own right rail next to the form; narrower it
    // stacks below the form inside the scrolling middle pane.
    <div className="@container flex min-h-0 flex-1">
      {/* Left rail: endpoint cards grouped by category. */}
      <aside className="w-72 shrink-0 overflow-y-auto border-r p-2">
        {PLAY_GROUPS.map((g) => {
          const eps = PLAY_ENDPOINTS.filter((e) => e.group === g.id);
          if (eps.length === 0) return null;
          return (
            <div key={g.id} className="mb-3">
              <div className="text-muted-foreground px-2 py-1.5 text-xs font-semibold">
                {t(`playground.groups.${g.id}`)}
              </div>
              <div className="space-y-1">
                {eps.map((ep) => (
                  <button
                    key={ep.id}
                    type="button"
                    onClick={() => selectEndpoint(ep.id)}
                    className={cn(
                      "w-full rounded-lg border p-2 text-left transition-colors",
                      ep.id === selectedId
                        ? "border-ring bg-accent"
                        : "hover:bg-accent/50 border-transparent",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <MethodBadge method={ep.method} />
                      <span className="truncate text-xs font-medium">{ep.label}</span>
                    </div>
                    <div className="text-muted-foreground mt-1 truncate font-mono text-[11px]">
                      {ep.path}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </aside>

      {/* Middle + right: the endpoint form, with the response beside it on
          wide containers and stacked below on narrow ones. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col @5xl:flex-row">
        <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
          <div className="shrink-0 border-b p-4">
            <div className="flex flex-wrap items-center gap-2">
              <MethodBadge method={endpoint.method} />
              <code className="text-sm break-all">
                <PathTemplate path={endpoint.path} />
              </code>
            </div>
            <p className="text-muted-foreground mt-1.5 text-xs">{endpoint.desc}</p>
          </div>

          <Form
            errors={errors}
            onSubmit={handleSubmit}
            className="flex shrink-0 flex-col gap-4 p-4"
          >
            {sections.map(
              (s) =>
                s.fields.length > 0 && (
                  <fieldset key={s.key} className="flex flex-col gap-3">
                    <legend className="text-muted-foreground mb-1 text-xs font-semibold">
                      {t(`playground.${s.key}`)}
                    </legend>
                    {s.fields.map((f) => (
                      <PlaygroundFieldControl
                        key={f.name}
                        field={f}
                        value={values[f.name] ?? ""}
                        onChange={(v) => setValues((cur) => ({ ...cur, [f.name]: v }))}
                        omitLabel={t("playground.omit")}
                      />
                    ))}
                  </fieldset>
                ),
            )}
            {fieldsOf(endpoint).length === 0 && (
              <p className="text-muted-foreground text-xs">{t("playground.noFields")}</p>
            )}
            <Button type="submit" loading={loading} className="self-start">
              {t("playground.send")}
            </Button>
          </Form>

          {/* Narrow containers: response below the form. */}
          {response && (
            <div className="@5xl:hidden flex max-h-[50vh] flex-col border-t">
              <ResponsePanel response={response} request={lastRequest} />
            </div>
          )}
        </section>

        {/* Wide containers: response as a dedicated right rail. */}
        {response && (
          <aside className="hidden w-[40%] max-w-[640px] shrink-0 flex-col border-l @5xl:flex">
            <ResponsePanel response={response} request={lastRequest} />
          </aside>
        )}
      </div>
    </div>
  );
}

// Status + duration header and the expandable JSON tree of the last response.
function ResponsePanel({
  response,
  request,
}: {
  response: PlayResponse;
  request: PlayRequest | null;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  // Copy the last request as a paste-and-run curl command; the label flips to
  // a check briefly so the click is visibly acknowledged.
  async function handleCopyCurl() {
    if (!request) return;
    try {
      await navigator.clipboard.writeText(toCurl(request));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable (e.g. insecure context) — nothing to fall back to
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col p-4">
      <div className="mb-2 flex shrink-0 items-center gap-2">
        <span className="text-xs font-semibold">{t("playground.response")}</span>
        <Badge variant={response.ok ? "success" : "destructive"}>
          {response.status === 0
            ? t("playground.networkError")
            : `HTTP ${response.status}`}
        </Badge>
        <span className="text-muted-foreground font-mono text-xs tabular-nums">
          {response.ms} ms
        </span>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto h-7 gap-1 px-2 text-xs"
          onClick={handleCopyCurl}
          disabled={!request}
        >
          {copied ? (
            <CheckIcon className="size-3.5" />
          ) : (
            <CopyIcon className="size-3.5" />
          )}
          {copied ? t("playground.copied") : t("playground.copyCurl")}
        </Button>
      </div>
      <JsonViewer
        data={response.data as never}
        rootName="response"
        defaultExpanded={true}
        className="min-h-0 flex-1 overflow-y-auto"
      />
    </div>
  );
}

// One Field per input, with the control chosen by the field's declared type.
function PlaygroundFieldControl({
  field,
  value,
  onChange,
  omitLabel,
}: {
  field: PlayField;
  value: string;
  onChange: (v: string) => void;
  omitLabel: string;
}) {
  const id = `pg-${field.name}`;
  const isTextarea =
    field.type === "textarea" || field.type === "lines" || field.type === "envs";
  const isSelect = field.type === "select" || field.type === "boolean";
  const options =
    field.type === "boolean" ? ["true", "false"] : field.options ?? [];

  return (
    <Field name={field.name} className="w-full">
      <FieldLabel htmlFor={id}>{field.label}</FieldLabel>
      {isSelect ? (
        <Select
          value={value === "" ? null : value}
          onValueChange={(v) => onChange(v == null ? "" : String(v))}
        >
          <SelectTrigger id={id} className="w-full">
            <SelectValue>
              {value === "" ? <span className="text-muted-foreground">{omitLabel}</span> : value}
            </SelectValue>
            <SelectIcon />
          </SelectTrigger>
          <SelectPopup>
            {options.map((o) => (
              <SelectItem key={o} value={o}>
                <SelectItemText>{o}</SelectItemText>
                <SelectItemIndicator />
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      ) : isTextarea ? (
        <Textarea
          id={id}
          placeholder={field.placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-16"
        />
      ) : (
        <Input
          id={id}
          type={field.type === "number" ? "number" : "text"}
          placeholder={field.placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {field.help && <FieldDescription>{field.help}</FieldDescription>}
      <FieldError />
    </Field>
  );
}
