import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router";

import { isNotFound, userMessage } from "../api/client";
import type { ColumnProfile, FeatureKind, TaskType, TrainRequest } from "../api/types";
import { KindBadge } from "../components/explorer/sections";
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  Card,
  CardHeader,
  Field,
  PageHeader,
  Spinner,
  cx,
  inputClass,
} from "../components/ui/primitives";
import { ErrorState, LoadingState } from "../components/ui/states";
import { useDataset, useDatasetProfile, useTrainModel } from "../hooks/queries";
import { USABLE_FEATURE_KINDS } from "../lib/misc";

const CRITERIA: Record<TaskType, { value: string; label: string }[]> = {
  classification: [
    { value: "gini", label: "Gini impurity" },
    { value: "entropy", label: "Entropy (information gain)" },
    { value: "log_loss", label: "Log loss" },
  ],
  regression: [
    { value: "squared_error", label: "Squared error (MSE)" },
    { value: "friedman_mse", label: "Friedman MSE" },
    { value: "absolute_error", label: "Absolute error (MAE, slower)" },
  ],
};

type MaxFeaturesChoice = "auto" | "sqrt" | "log2" | "all" | "fraction";

interface FormState {
  target: string;
  task: TaskType;
  features: string[];
  asCategorical: string[];
  testSize: number;
  stratify: boolean;
  randomState: string;
  nEstimators: string;
  limitDepth: boolean;
  maxDepth: string;
  minSamplesSplit: string;
  minSamplesLeaf: string;
  maxFeatures: MaxFeaturesChoice;
  maxFeaturesFraction: string;
  bootstrap: boolean;
  criterion: string;
  name: string;
}

function intInRange(raw: string, min: number, max: number): number | null {
  const n = Number(raw);
  return raw.trim() !== "" && Number.isInteger(n) && n >= min && n <= max ? n : null;
}

export function validateForm(form: FormState): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!form.target) errors.target = "Choose a target column.";
  if (form.features.length === 0) errors.features = "Select at least one feature.";
  if (intInRange(form.nEstimators, 1, 500) === null) errors.nEstimators = "Enter a whole number from 1 to 500.";
  if (form.limitDepth && intInRange(form.maxDepth, 1, 30) === null) errors.maxDepth = "Enter a whole number from 1 to 30.";
  if (intInRange(form.minSamplesSplit, 2, 1000) === null) errors.minSamplesSplit = "Enter a whole number from 2 to 1000.";
  if (intInRange(form.minSamplesLeaf, 1, 1000) === null) errors.minSamplesLeaf = "Enter a whole number from 1 to 1000.";
  if (intInRange(form.randomState, 0, 2 ** 31 - 1) === null) errors.randomState = "Enter a non-negative whole number.";
  if (form.maxFeatures === "fraction") {
    const f = Number(form.maxFeaturesFraction);
    if (!(f > 0 && f <= 1)) errors.maxFeaturesFraction = "Enter a fraction greater than 0 and at most 1.";
  }
  return errors;
}

export function toRequest(datasetId: string, form: FormState): TrainRequest {
  const columnTypes: Record<string, FeatureKind> = {};
  for (const name of form.asCategorical) {
    if (form.features.includes(name)) columnTypes[name] = "categorical";
  }
  const maxFeatures =
    form.maxFeatures === "auto"
      ? null
      : form.maxFeatures === "all"
        ? 1.0
        : form.maxFeatures === "fraction"
          ? Number(form.maxFeaturesFraction)
          : form.maxFeatures;
  return {
    dataset_id: datasetId,
    name: form.name.trim() || null,
    task_type: form.task,
    target_column: form.target,
    feature_columns: form.features,
    column_types: columnTypes,
    test_size: form.testSize,
    stratify: form.task === "classification" && form.stratify,
    random_state: Number(form.randomState),
    hyperparameters: {
      n_estimators: Number(form.nEstimators),
      max_depth: form.limitDepth ? Number(form.maxDepth) : null,
      min_samples_split: Number(form.minSamplesSplit),
      min_samples_leaf: Number(form.minSamplesLeaf),
      max_features: maxFeatures,
      bootstrap: form.bootstrap,
      criterion: form.criterion,
    },
  };
}

function initialForm(columns: ColumnProfile[]): FormState {
  const candidates = columns.filter((c) => c.target.classification || c.target.regression);
  const last = columns[columns.length - 1];
  const target = last && candidates.includes(last) ? last : candidates[0];
  const task: TaskType = target?.target.suggested_task ?? "classification";
  return {
    target: target?.name ?? "",
    task,
    features: columns
      .filter((c) => USABLE_FEATURE_KINDS.has(c.inferred_kind) && c.name !== target?.name)
      .map((c) => c.name),
    asCategorical: [],
    testSize: 0.2,
    stratify: true,
    randomState: "42",
    nEstimators: "100",
    limitDepth: true,
    maxDepth: "10",
    minSamplesSplit: "2",
    minSamplesLeaf: "1",
    maxFeatures: "auto",
    maxFeaturesFraction: "0.5",
    bootstrap: true,
    criterion: CRITERIA[task][0]!.value,
    name: "",
  };
}

function Hint({ children }: { children: ReactNode }) {
  return <span className="text-ink-faint">{children}</span>;
}

export default function ModelConfigPage() {
  const { datasetId = "" } = useParams();
  const navigate = useNavigate();
  const dataset = useDataset(datasetId);
  const profile = useDatasetProfile(datasetId);
  const train = useTrainModel();
  const [form, setForm] = useState<FormState | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const ids = { target: useId(), n: useId(), depth: useId(), split: useId(), leaf: useId(), mf: useId(), mff: useId(), crit: useId(), seed: useId(), name: useId(), test: useId() };

  useEffect(() => {
    if (profile.data && !form) setForm(initialForm(profile.data.columns));
  }, [profile.data, form]);

  const columns = profile.data?.columns ?? [];
  const byName = useMemo(() => new Map(columns.map((c) => [c.name, c])), [columns]);
  const targets = columns.filter((c) => c.target.classification || c.target.regression);
  const usable = columns.filter((c) => USABLE_FEATURE_KINDS.has(c.inferred_kind));
  const excluded = columns.filter((c) => !USABLE_FEATURE_KINDS.has(c.inferred_kind));

  const error = dataset.error ?? profile.error;
  if (error) {
    return (
      <Card>
        <ErrorState
          error={error}
          title={isNotFound(error) ? "Dataset not found" : "Could not load this dataset"}
          action={<ButtonLink to="/workspace" variant="secondary">Back to workspace</ButtonLink>}
        />
      </Card>
    );
  }
  if (!dataset.data || !profile.data || !form) return <LoadingState label="Loading dataset…" />;

  const set = (patch: Partial<FormState>) => setForm((prev) => (prev ? { ...prev, ...patch } : prev));
  const errors = validateForm(form);
  const showErrors = submitted;
  const targetCol = byName.get(form.target);

  const chooseTarget = (name: string) => {
    const col = byName.get(name);
    const task = col?.target.suggested_task ?? form.task;
    const previous = byName.get(form.target);
    const features = form.features.filter((f) => f !== name);
    if (previous && USABLE_FEATURE_KINDS.has(previous.inferred_kind) && !features.includes(previous.name)) {
      features.push(previous.name);
    }
    set({ target: name, task, features, criterion: CRITERIA[task][0]!.value });
  };

  const chooseTask = (task: TaskType) => set({ task, criterion: CRITERIA[task][0]!.value });

  const toggleFeature = (name: string) =>
    set({
      features: form.features.includes(name)
        ? form.features.filter((f) => f !== name)
        : columns.filter((c) => c.name === name || form.features.includes(c.name)).map((c) => c.name),
    });

  const submit = () => {
    setSubmitted(true);
    if (Object.keys(errors).length > 0) return;
    train.mutate(toRequest(datasetId, form), {
      onSuccess: (model) => navigate(`/models/${model.id}`),
    });
  };

  const trainRows = Math.round(dataset.data.n_rows * (1 - form.testSize));
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="Model Configuration"
        title={`Train a Random Forest on ${dataset.data.name}`}
        description="Choose what to predict, which columns the trees may use, how to hold out test data and how the forest is grown."
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="1. Target and task" description="The column the model learns to predict." />
            <div className="grid gap-5 p-5 md:grid-cols-2">
              <Field label="Target column" htmlFor={ids.target} error={showErrors ? errors.target : null}
                hint={targetCol?.target.suggested_task ? `Suggested task: ${targetCol.target.suggested_task} (a recommendation; you decide).` : undefined}>
                <select id={ids.target} className={inputClass} value={form.target} onChange={(e) => chooseTarget(e.target.value)}>
                  {targets.length === 0 && <option value="">No suitable target columns</option>}
                  {targets.map((c) => (
                    <option key={c.name} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </Field>
              <fieldset>
                <legend className="mb-1.5 text-sm font-medium text-ink">Task type</legend>
                <div className="grid grid-cols-2 gap-2">
                  {(["classification", "regression"] as const).map((task) => {
                    const allowed = targetCol ? targetCol.target[task] : false;
                    return (
                      <label key={task} className={cx("flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm",
                        form.task === task ? "border-teal-400 bg-teal-400/10 text-teal-100" : "border-navy-500 text-ink-muted",
                        !allowed && "cursor-not-allowed opacity-40")}>
                        <input type="radio" name="task" value={task} checked={form.task === task} disabled={!allowed}
                          onChange={() => chooseTask(task)} className="accent-teal-400" />
                        {task === "classification" ? "Classification" : "Regression"}
                      </label>
                    );
                  })}
                </div>
                <p className="mt-1 text-xs text-ink-faint">
                  {form.task === "classification" ? "Predict a category; trees vote and probabilities are averaged." : "Predict a number; the forest averages the trees' predictions."}
                </p>
              </fieldset>
              {targetCol && targetCol.target.missing_target_rows > 0 && (
                <div className="md:col-span-2">
                  <Alert tone="warning">
                    {targetCol.target.missing_target_rows} rows have no value for “{targetCol.name}” and will be dropped before training.
                  </Alert>
                </div>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="2. Features" description="Columns the trees may split on. The target is never included, which prevents leaking the answer." actions={
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => set({ features: usable.filter((c) => c.name !== form.target).map((c) => c.name) })}>Select all</Button>
                <Button size="sm" variant="ghost" onClick={() => set({ features: [] })}>Clear</Button>
              </div>
            } />
            <div className="p-5">
              {showErrors && errors.features && <p className="mb-3 text-sm text-rose-300">{errors.features}</p>}
              <ul className="grid gap-2 sm:grid-cols-2">
                {usable.map((c) => {
                  const isTarget = c.name === form.target;
                  const checked = form.features.includes(c.name);
                  return (
                    <li key={c.name} className={cx("rounded-lg border px-3 py-2.5", checked ? "border-teal-400/40 bg-navy-900" : "border-navy-600", isTarget && "opacity-50")}>
                      <label className="flex cursor-pointer items-center gap-3">
                        <input type="checkbox" className="accent-teal-400" checked={checked} disabled={isTarget} onChange={() => toggleFeature(c.name)} />
                        <span className="min-w-0 flex-1 truncate font-mono text-sm text-ink">{c.name}</span>
                        {isTarget ? <Badge tone="amber">target</Badge> : <KindBadge kind={c.inferred_kind} />}
                      </label>
                      {c.inferred_kind === "numeric" && checked && (
                        <label className="ml-7 mt-1.5 flex items-center gap-2 text-xs text-ink-muted">
                          <input type="checkbox" className="accent-teal-400" checked={form.asCategorical.includes(c.name)}
                            onChange={(e) => set({ asCategorical: e.target.checked ? [...form.asCategorical, c.name] : form.asCategorical.filter((n) => n !== c.name) })} />
                          Treat as categorical (e.g. codes like 1/2/3)
                        </label>
                      )}
                    </li>
                  );
                })}
              </ul>
              {excluded.length > 0 && (
                <p className="mt-4 text-xs text-ink-faint">
                  Not usable as features: {excluded.map((c) => `${c.name} (${c.inferred_kind.replace("_", "-")})`).join(", ")}.
                </p>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="3. Train/test split" description="The test rows are held out before anything is learned, so the evaluation is honest." />
            <div className="grid gap-5 p-5 md:grid-cols-2">
              <Field label={`Test size: ${Math.round(form.testSize * 100)}%`} htmlFor={ids.test}
                hint={`≈ ${trainRows.toLocaleString("en-US")} training rows / ${(dataset.data.n_rows - trainRows).toLocaleString("en-US")} test rows`}>
                <input id={ids.test} type="range" min={0.1} max={0.5} step={0.05} value={form.testSize}
                  onChange={(e) => set({ testSize: Number(e.target.value) })} className="w-full accent-teal-400" />
              </Field>
              <Field label="Random seed (random_state)" htmlFor={ids.seed} error={showErrors ? errors.randomState : null} hint="The same seed reproduces the same split and forest.">
                <input id={ids.seed} className={inputClass} inputMode="numeric" value={form.randomState} onChange={(e) => set({ randomState: e.target.value })} />
              </Field>
              {form.task === "classification" && (
                <label className="flex items-start gap-3 text-sm md:col-span-2">
                  <input type="checkbox" className="mt-0.5 accent-teal-400" checked={form.stratify} onChange={(e) => set({ stratify: e.target.checked })} />
                  <span>
                    <span className="text-ink">Stratified split</span>{" "}
                    <Hint>keeps the class proportions the same in the training and test sets.</Hint>
                  </span>
                </label>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="4. Random Forest hyperparameters" description="How many trees are grown and how each tree is allowed to split." />
            <div className="grid gap-5 p-5 md:grid-cols-2">
              <Field label="Number of trees (n_estimators)" htmlFor={ids.n} error={showErrors ? errors.nEstimators : null} hint="More trees give more stable predictions but train more slowly (1–500).">
                <input id={ids.n} className={inputClass} inputMode="numeric" value={form.nEstimators} onChange={(e) => set({ nEstimators: e.target.value })} />
              </Field>
              <Field label="Maximum tree depth (max_depth)" htmlFor={ids.depth} error={showErrors ? errors.maxDepth : null} hint="Shallower trees are easier to read and less likely to overfit.">
                <div className="flex items-center gap-3">
                  <input id={ids.depth} className={inputClass} inputMode="numeric" value={form.maxDepth} disabled={!form.limitDepth} onChange={(e) => set({ maxDepth: e.target.value })} />
                  <label className="flex shrink-0 items-center gap-2 text-xs text-ink-muted">
                    <input type="checkbox" className="accent-teal-400" checked={!form.limitDepth} onChange={(e) => set({ limitDepth: !e.target.checked })} />
                    No limit
                  </label>
                </div>
              </Field>
              <Field label="Min samples to split (min_samples_split)" htmlFor={ids.split} error={showErrors ? errors.minSamplesSplit : null} hint="A node needs at least this many rows before it may split.">
                <input id={ids.split} className={inputClass} inputMode="numeric" value={form.minSamplesSplit} onChange={(e) => set({ minSamplesSplit: e.target.value })} />
              </Field>
              <Field label="Min samples per leaf (min_samples_leaf)" htmlFor={ids.leaf} error={showErrors ? errors.minSamplesLeaf : null} hint="Every leaf must keep at least this many rows.">
                <input id={ids.leaf} className={inputClass} inputMode="numeric" value={form.minSamplesLeaf} onChange={(e) => set({ minSamplesLeaf: e.target.value })} />
              </Field>
              <Field label="Features per split (max_features)" htmlFor={ids.mf} hint="How many randomly chosen features each split may consider; randomness makes the trees differ.">
                <select id={ids.mf} className={inputClass} value={form.maxFeatures} onChange={(e) => set({ maxFeatures: e.target.value as MaxFeaturesChoice })}>
                  <option value="auto">Default ({form.task === "classification" ? "√ features" : "all features"})</option>
                  <option value="sqrt">√ features (sqrt)</option>
                  <option value="log2">log₂ features (log2)</option>
                  <option value="all">All features</option>
                  <option value="fraction">A fraction of features…</option>
                </select>
              </Field>
              <Field label="Split criterion" htmlFor={ids.crit} hint="How the quality of a split is measured.">
                <select id={ids.crit} className={inputClass} value={form.criterion} onChange={(e) => set({ criterion: e.target.value })}>
                  {CRITERIA[form.task].map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </Field>
              {form.maxFeatures === "fraction" && (
                <Field label="Fraction of features" htmlFor={ids.mff} error={showErrors ? errors.maxFeaturesFraction : null}>
                  <input id={ids.mff} className={inputClass} inputMode="decimal" value={form.maxFeaturesFraction} onChange={(e) => set({ maxFeaturesFraction: e.target.value })} />
                </Field>
              )}
              <label className="flex items-start gap-3 text-sm md:col-span-2">
                <input type="checkbox" className="mt-0.5 accent-teal-400" checked={form.bootstrap} onChange={(e) => set({ bootstrap: e.target.checked })} />
                <span>
                  <span className="text-ink">Bootstrap sampling</span>{" "}
                  <Hint>each tree trains on a random sample of rows drawn with replacement.</Hint>
                </span>
              </label>
            </div>
          </Card>
        </div>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <Card className="p-5">
            <h2 className="font-semibold text-ink">Summary</h2>
            <dl className="mt-4 space-y-2 text-sm">
              {[
                ["Target", form.target || "—"],
                ["Task", form.task],
                ["Features", String(form.features.length)],
                ["Test size", `${Math.round(form.testSize * 100)}%`],
                ["Trees", form.nEstimators],
                ["Max depth", form.limitDepth ? form.maxDepth : "no limit"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="text-ink-faint">{k}</dt>
                  <dd className="truncate font-medium text-ink">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-5">
              <Field label="Model name (optional)" htmlFor={ids.name}>
                <input id={ids.name} className={inputClass} maxLength={100} placeholder={`${dataset.data.name} · Random Forest`} value={form.name} onChange={(e) => set({ name: e.target.value })} />
              </Field>
            </div>
            {showErrors && Object.keys(errors).length > 0 && (
              <p role="alert" className="mt-4 text-sm text-rose-300">Please fix the highlighted fields.</p>
            )}
            {train.isError && (
              <div className="mt-4">
                <Alert tone="error" title="Training failed">{userMessage(train.error)}</Alert>
              </div>
            )}
            <Button className="mt-5 w-full" size="lg" onClick={submit} disabled={train.isPending || targets.length === 0}>
              {train.isPending ? (<><Spinner /> Training {form.nEstimators} trees…</>) : "Train Random Forest"}
            </Button>
            <p className="mt-3 text-xs text-ink-faint">
              Training runs on the server with scikit-learn. Large datasets with many trees can take a little while.
            </p>
          </Card>
        </aside>
      </div>
    </div>
  );
}
