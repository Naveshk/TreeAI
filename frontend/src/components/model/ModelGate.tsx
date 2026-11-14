import type { ReactNode } from "react";

import { isNotFound } from "../../api/client";
import type { ModelDetail } from "../../api/types";
import { useModel } from "../../hooks/queries";
import { Alert, ButtonLink, Card } from "../ui/primitives";
import { ErrorState, LoadingState } from "../ui/states";

/** Loads a model and only renders `children` when it exists and is ready. */
export function ModelGate({
  modelId,
  children,
}: {
  modelId: string;
  children: (model: ModelDetail) => ReactNode;
}) {
  const model = useModel(modelId);
  if (model.isLoading) return <LoadingState label="Loading model…" />;
  if (model.error || !model.data) {
    return (
      <Card>
        <ErrorState
          error={model.error}
          title={isNotFound(model.error) ? "Model not found" : "Could not load this model"}
          action={<ButtonLink to="/workspace" variant="secondary">Back to workspace</ButtonLink>}
        />
      </Card>
    );
  }
  if (model.data.status !== "ready") {
    return (
      <Alert tone="error" title="This model is not available">
        {model.data.error_message ?? "Training did not complete."} Configure and train a new model
        from the dataset.
      </Alert>
    );
  }
  return <>{children(model.data)}</>;
}
