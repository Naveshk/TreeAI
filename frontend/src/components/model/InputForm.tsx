import { useId, useState, type FormEvent } from "react";

import type { FeatureInput, PredictionInputs } from "../../api/types";
import { formatNumber } from "../../lib/format";
import { Button, Spinner, cx, inputClass } from "../ui/primitives";

export type InputValues = Record<string, string>;

const storageKey = (modelId: string) => `treemind:inputs:${modelId}`;

/** Per-browser convenience only: remember the last inputs used for a model. */
export function loadSavedInputs(modelId: string): InputValues | null {
  try {
    const raw = window.sessionStorage.getItem(storageKey(modelId));
    return raw ? (JSON.parse(raw) as InputValues) : null;
  } catch {
    return null;
  }
}

export function saveInputs(modelId: string, values: InputValues): void {
  try {
    window.sessionStorage.setItem(storageKey(modelId), JSON.stringify(values));
  } catch {
    /* storage unavailable: nothing to do */
  }
}

export function typicalValues(features: FeatureInput[]): InputValues {
  return Object.fromEntries(
    features.map((f) => [
      f.name,
      f.kind === "numeric"
        ? f.train_median === null
          ? ""
          : String(Number(f.train_median.toFixed(4)))
        : (f.train_mode ?? ""),
    ]),
  );
}

export function validateInputs(features: FeatureInput[], values: InputValues): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of features) {
    const raw = (values[f.name] ?? "").trim();
    if (f.kind === "numeric" && raw !== "" && !Number.isFinite(Number(raw))) {
      errors[f.name] = "Enter a number or leave empty.";
    }
  }
  return errors;
}

/** Empty fields become null: the model's own fitted imputer fills them on the server. */
export function toPredictionInputs(features: FeatureInput[], values: InputValues): PredictionInputs {
  const inputs: PredictionInputs = {};
  for (const f of features) {
    const raw = (values[f.name] ?? "").trim();
    inputs[f.name] = raw === "" ? null : f.kind === "numeric" ? Number(raw) : raw;
  }
  return inputs;
}

export function InputForm({
  features,
  values,
  onChange,
  onSubmit,
  submitting,
  submitLabel,
  columns = 2,
}: {
  features: FeatureInput[];
  values: InputValues;
  onChange: (values: InputValues) => void;
  onSubmit: () => void;
  submitting: boolean;
  submitLabel: string;
  columns?: 1 | 2;
}) {
  const baseId = useId();
  const [touched, setTouched] = useState(false);
  const errors = validateInputs(features, values);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (Object.keys(errors).length === 0) onSubmit();
  };

  return (
    <form onSubmit={submit} noValidate>
      <div className={cx("grid gap-4", columns === 2 && "sm:grid-cols-2")}>
        {features.map((f, i) => {
          const id = `${baseId}-${i}`;
          const error = touched ? errors[f.name] : undefined;
          return (
            <div key={f.name}>
              <label htmlFor={id} className="mb-1 flex items-center justify-between gap-2 text-sm">
                <span className="truncate font-mono text-ink">{f.name}</span>
                <span className="shrink-0 text-xs text-ink-faint">{f.kind}</span>
              </label>
              {f.kind === "numeric" ? (
                <input
                  id={id}
                  className={cx(inputClass, error && "border-rose-400")}
                  inputMode="decimal"
                  value={values[f.name] ?? ""}
                  placeholder={f.train_median === null ? "" : `median ${formatNumber(f.train_median)}`}
                  aria-invalid={Boolean(error)}
                  aria-describedby={`${id}-hint`}
                  onChange={(e) => onChange({ ...values, [f.name]: e.target.value })}
                />
              ) : (
                <select
                  id={id}
                  className={inputClass}
                  value={values[f.name] ?? ""}
                  aria-describedby={`${id}-hint`}
                  onChange={(e) => onChange({ ...values, [f.name]: e.target.value })}
                >
                  <option value="">(missing: use “{f.train_mode}”)</option>
                  {(f.categories ?? []).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              )}
              <p id={`${id}-hint`} className={cx("mt-1 text-xs", error ? "text-rose-300" : "text-ink-faint")}>
                {error ??
                  (f.kind === "numeric"
                    ? f.train_min === null
                      ? "Leave empty to use the training median."
                      : `Training range ${formatNumber(f.train_min)} – ${formatNumber(f.train_max)}`
                    : `${f.categories?.length ?? 0} categories seen in training`)}
              </p>
            </div>
          );
        })}
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? (
            <>
              <Spinner /> Working…
            </>
          ) : (
            submitLabel
          )}
        </Button>
        <Button variant="secondary" onClick={() => onChange(typicalValues(features))} disabled={submitting}>
          Fill typical values
        </Button>
        <Button variant="ghost" onClick={() => onChange({})} disabled={submitting}>
          Clear
        </Button>
      </div>
    </form>
  );
}
