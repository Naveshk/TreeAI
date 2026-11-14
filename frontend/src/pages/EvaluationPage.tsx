import { useNavigate, useParams } from "react-router";

import type { ClassificationMetrics, ModelDetail, RegressionMetrics } from "../api/types";
import { DeleteButton } from "../components/DeleteButton";
import { ModelGate } from "../components/model/ModelGate";
import { TargetIcon, TreeIcon } from "../components/ui/icons";
import { Alert, Badge, ButtonLink, Card, CardHeader, PageHeader, StatCard, cx } from "../components/ui/primitives";
import { ErrorState, LoadingState } from "../components/ui/states";
import { useDeleteModel, useEvaluation } from "../hooks/queries";
import { formatDateTime, formatDuration, formatInteger, formatNumber, formatPercent } from "../lib/format";

const EXPLAIN = {
  accuracy: "Share of test rows whose class was predicted correctly.",
  precision: "Of the rows predicted as a class, how many really belong to it.",
  recall: "Of the rows that really belong to a class, how many were found.",
  f1: "Harmonic mean of precision and recall; balances the two.",
  mae: "Average absolute difference between prediction and true value (target units).",
  rmse: "Square root of the average squared error; penalises large mistakes more (target units).",
  mse: "Average squared error.",
  r2: "Share of the target's variance explained by the model: 1 is perfect, 0 is no better than predicting the mean.",
};

function ConfusionMatrix({ metrics }: { metrics: ClassificationMetrics }) {
  const { labels, matrix } = metrics.confusion_matrix;
  const max = Math.max(1, ...matrix.flat());
  return (
    <div className="overflow-x-auto">
      <table className="mx-auto border-separate border-spacing-1 text-sm" aria-label="Confusion matrix">
        <thead>
          <tr>
            <th className="px-2 text-right text-xs font-normal text-ink-faint">actual ↓ / predicted →</th>
            {labels.map((l) => (
              <th key={l} scope="col" className="max-w-28 truncate px-2 py-1 text-xs font-medium text-ink-muted">{l}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, i) => (
            <tr key={labels[i]}>
              <th scope="row" className="max-w-32 truncate px-2 text-right text-xs font-medium text-ink-muted">{labels[i]}</th>
              {row.map((count, j) => {
                const intensity = count / max;
                const diagonal = i === j;
                return (
                  <td
                    key={j}
                    className={cx("tabular h-12 min-w-14 rounded-md text-center font-medium", intensity > 0.55 ? "text-navy-950" : "text-ink")}
                    style={{
                      backgroundColor: diagonal
                        ? `rgba(45, 212, 191, ${0.12 + intensity * 0.83})`
                        : `rgba(251, 113, 133, ${count === 0 ? 0.05 : 0.15 + intensity * 0.6})`,
                    }}
                    title={`${count} test rows of class “${labels[i]}” predicted as “${labels[j]}”`}
                  >
                    {count}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-center text-xs text-ink-faint">Teal diagonal cells are correct predictions; red cells are mistakes.</p>
    </div>
  );
}

function ClassificationResults({ metrics }: { metrics: ClassificationMetrics }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Accuracy" value={formatPercent(metrics.accuracy)} hint={EXPLAIN.accuracy} />
        <StatCard label="Precision (macro)" value={formatPercent(metrics.precision_macro)} hint={EXPLAIN.precision} />
        <StatCard label="Recall (macro)" value={formatPercent(metrics.recall_macro)} hint={EXPLAIN.recall} />
        <StatCard label="F1-score (macro)" value={formatPercent(metrics.f1_macro)} hint={EXPLAIN.f1} />
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Confusion matrix" description={`All ${metrics.n_samples} held-out test rows.`} />
          <div className="p-5"><ConfusionMatrix metrics={metrics} /></div>
        </Card>
        <Card>
          <CardHeader title="Per-class metrics" description="Macro averages weight every class equally; weighted averages weight classes by their support." />
          <div className="overflow-x-auto">
            <table className="tabular w-full text-sm">
              <thead className="border-b border-navy-600 text-xs uppercase tracking-wide text-ink-faint">
                <tr>
                  <th className="px-5 py-2.5 text-left font-medium">Class</th>
                  <th className="px-3 py-2.5 text-right font-medium">Precision</th>
                  <th className="px-3 py-2.5 text-right font-medium">Recall</th>
                  <th className="px-3 py-2.5 text-right font-medium">F1</th>
                  <th className="px-5 py-2.5 text-right font-medium">Support</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-600">
                {metrics.per_class.map((c) => (
                  <tr key={c.label}>
                    <td className="px-5 py-2.5 text-ink">{c.label}</td>
                    <td className="px-3 py-2.5 text-right text-ink-muted">{formatPercent(c.precision)}</td>
                    <td className="px-3 py-2.5 text-right text-ink-muted">{formatPercent(c.recall)}</td>
                    <td className="px-3 py-2.5 text-right text-ink-muted">{formatPercent(c.f1)}</td>
                    <td className="px-5 py-2.5 text-right text-ink-muted">{c.support}</td>
                  </tr>
                ))}
                <tr className="text-ink-faint">
                  <td className="px-5 py-2.5">Weighted average</td>
                  <td className="px-3 py-2.5 text-right">{formatPercent(metrics.precision_weighted)}</td>
                  <td className="px-3 py-2.5 text-right">{formatPercent(metrics.recall_weighted)}</td>
                  <td className="px-3 py-2.5 text-right">{formatPercent(metrics.f1_weighted)}</td>
                  <td className="px-5 py-2.5 text-right">{metrics.n_samples}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}

function RegressionResults({ metrics }: { metrics: RegressionMetrics }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label="MAE" value={formatNumber(metrics.mae)} hint={EXPLAIN.mae} />
      <StatCard label="RMSE" value={formatNumber(metrics.rmse)} hint={EXPLAIN.rmse} />
      <StatCard label="MSE" value={formatNumber(metrics.mse)} hint={EXPLAIN.mse} />
      <StatCard label="R² score" value={metrics.r2 === null ? "n/a" : formatNumber(metrics.r2)} hint={metrics.r2 === null ? "Undefined for this test set (too few rows or constant values)." : EXPLAIN.r2} />
    </div>
  );
}

function ModelSummary({ model }: { model: ModelDetail }) {
  const hp = model.hyperparameters;
  return (
    <Card>
      <CardHeader title="Training configuration" />
      <div className="grid gap-6 p-5 md:grid-cols-2">
        <dl className="space-y-2 text-sm">
          {[
            ["Target", model.target_column],
            ["Task", model.task_type],
            ["Training rows", model.n_train === null ? "—" : formatInteger(model.n_train)],
            ["Test rows", model.n_test === null ? "—" : formatInteger(model.n_test)],
            ["Test size", `${Math.round(model.test_size * 100)}%${model.stratified ? " (stratified)" : ""}`],
            ["Rows dropped (missing target)", String(model.rows_dropped_missing_target ?? 0)],
            ["Random seed", String(model.random_state)],
            ["Training time", formatDuration(model.train_duration_ms)],
            ["Trained", formatDateTime(model.created_at)],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4">
              <dt className="text-ink-faint">{k}</dt>
              <dd className="text-right text-ink">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="space-y-4">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Hyperparameters</h3>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {Object.entries(hp).map(([k, v]) => (
                <li key={k}>
                  <code className="rounded bg-navy-700 px-2 py-1 text-xs text-ink">{k}={v === null ? "None" : String(v)}</code>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Features ({model.feature_columns.length})</h3>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {model.feature_columns.map((f) => (
                <li key={f}>
                  <Badge tone={model.column_types[f] === "categorical" ? "violet" : "sky"}>{f}</Badge>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </Card>
  );
}

function EvaluationContent({ model }: { model: ModelDetail }) {
  const navigate = useNavigate();
  const evaluation = useEvaluation(model.id);
  const remove = useDeleteModel();
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        eyebrow="Training & Evaluation"
        title={model.name}
        description={`A ${model.hyperparameters.n_estimators}-tree Random Forest predicting “${model.target_column}”. All metrics are computed on the ${model.n_test ?? ""} held-out test rows the model never saw during training.`}
        actions={
          <>
            <DeleteButton
              size="md"
              label={`Delete ${model.name}`}
              title={`Delete “${model.name}”?`}
              description="This permanently removes the trained model and its evaluation. The dataset is kept."
              pending={remove.isPending}
              error={remove.error}
              onConfirm={() => remove.mutate(model.id, { onSuccess: () => navigate(`/datasets/${model.dataset_id}/train`) })}
            />
            <ButtonLink to={`/models/${model.id}/predict`} variant="secondary"><TargetIcon /> Prediction Studio</ButtonLink>
            <ButtonLink to={`/models/${model.id}/forest`}><TreeIcon /> Forest Explorer</ButtonLink>
          </>
        }
      />
      {evaluation.isLoading && <LoadingState label="Loading evaluation…" />}
      {evaluation.isError && <Card><ErrorState error={evaluation.error} onRetry={() => void evaluation.refetch()} /></Card>}
      {evaluation.data && (
        <>
          <Alert tone="info">
            Evaluated on {evaluation.data.metrics.n_samples} test rows. The preprocessing (missing-value filling and category encoding) was learned from the training rows only.
          </Alert>
          {evaluation.data.metrics.task_type === "classification" ? (
            <ClassificationResults metrics={evaluation.data.metrics} />
          ) : (
            <RegressionResults metrics={evaluation.data.metrics} />
          )}
        </>
      )}
      <ModelSummary model={model} />
    </div>
  );
}

export default function EvaluationPage() {
  const { modelId = "" } = useParams();
  return <ModelGate modelId={modelId}>{(model) => <EvaluationContent model={model} />}</ModelGate>;
}
