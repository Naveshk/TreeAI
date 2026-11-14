import { useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";

import { userMessage } from "../api/client";
import type { ModelDetail, PredictResponse } from "../api/types";
import {
  InputForm,
  loadSavedInputs,
  saveInputs,
  toPredictionInputs,
  type InputValues,
} from "../components/model/InputForm";
import { ModelGate } from "../components/model/ModelGate";
import { ProbabilityList } from "../components/model/ProbabilityList";
import { TreeIcon } from "../components/ui/icons";
import { Alert, Button, Card, CardHeader, PageHeader } from "../components/ui/primitives";
import { EmptyState, ErrorState, LoadingState } from "../components/ui/states";
import { useInputSchema, usePredict } from "../hooks/queries";
import { formatNumber, formatPercent, formatPrediction } from "../lib/format";

function PredictionResult({
  result,
  model,
  onExplain,
}: {
  result: PredictResponse;
  model: ModelDetail;
  onExplain: () => void;
}) {
  const classification = result.task_type === "classification";
  const top = result.probabilities?.find((p) => p.label === result.prediction);
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-teal-400/30 bg-teal-400/5 p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-teal-300">
          Predicted {model.target_column}
        </p>
        <p className="tabular mt-2 break-words text-3xl font-semibold text-ink" data-testid="prediction">
          {formatPrediction(result.prediction)}
        </p>
        <p className="mt-2 text-sm text-ink-muted">
          {classification
            ? `The forest's averaged probability for this class is ${formatPercent(top?.probability ?? 0)}. This is scikit-learn's predict() result.`
            : `The average of the ${model.hyperparameters.n_estimators} trees' predictions, as returned by scikit-learn's predict().`}
        </p>
      </div>
      {classification && result.probabilities && model.classes && (
        <div>
          <h3 className="mb-3 text-sm font-medium text-ink">Class probabilities</h3>
          <ProbabilityList
            probabilities={result.probabilities}
            classes={model.classes}
            predicted={String(result.prediction)}
          />
          <p className="mt-3 text-xs text-ink-faint">
            Each tree outputs class probabilities from the training rows in the leaf your input
            reaches; the forest averages them across all trees.
          </p>
        </div>
      )}
      {result.imputed_features.length > 0 && (
        <Alert tone="info" title="Filled-in values">
          <ul className="list-disc pl-4">
            {result.imputed_features.map((f) => (
              <li key={f.feature}>
                <span className="font-mono">{f.feature}</span> was empty and was filled with{" "}
                <strong>{typeof f.value === "number" ? formatNumber(f.value) : f.value}</strong> ({f.strategy}).
              </li>
            ))}
          </ul>
        </Alert>
      )}
      {result.warnings.map((w) => (
        <Alert key={w} tone="warning">
          {w} Trees can only use thresholds learned from the training data.
        </Alert>
      ))}
      <Button onClick={onExplain}>
        <TreeIcon /> See how the trees decided
      </Button>
    </div>
  );
}

function StudioContent({ model }: { model: ModelDetail }) {
  const location = useLocation();
  const navigate = useNavigate();
  const schema = useInputSchema(model.id);
  const predict = usePredict(model.id);
  const [values, setValues] = useState<InputValues>(
    () => (location.state as { inputs?: InputValues } | null)?.inputs ?? loadSavedInputs(model.id) ?? {},
  );

  if (schema.isLoading) return <LoadingState label="Loading model inputs…" />;
  if (schema.error || !schema.data) {
    return <Card><ErrorState error={schema.error} onRetry={() => void schema.refetch()} /></Card>;
  }
  const features = schema.data.features;

  const run = () => {
    saveInputs(model.id, values);
    predict.mutate(toPredictionInputs(features, values));
  };

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        eyebrow="Prediction Studio"
        title={model.name}
        description={`Enter values for the ${features.length} features the model was trained on. Leave a field empty to let the model fill it from the training data.`}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title="Input values" description="The form is generated from the trained model's features." />
          <div className="p-5">
            <InputForm
              features={features}
              values={values}
              onChange={setValues}
              onSubmit={run}
              submitting={predict.isPending}
              submitLabel="Predict"
            />
          </div>
        </Card>
        <Card className="lg:sticky lg:top-20 lg:self-start">
          <CardHeader title="Prediction" />
          <div className="p-5">
            {predict.isError && <Alert tone="error" title="Prediction failed">{userMessage(predict.error)}</Alert>}
            {!predict.data && !predict.isError && (
              <EmptyState title="No prediction yet" description="Fill in the form and press Predict." />
            )}
            {predict.data && (
              <PredictionResult
                result={predict.data}
                model={model}
                onExplain={() => navigate(`/models/${model.id}/forest`, { state: { inputs: values, explain: true } })}
              />
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

export default function PredictionStudioPage() {
  const { modelId = "" } = useParams();
  return <ModelGate modelId={modelId}>{(model) => <StudioContent model={model} />}</ModelGate>;
}
