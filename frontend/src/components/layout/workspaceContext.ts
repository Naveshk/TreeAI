import { useParams } from "react-router";

import { useModel, useModelList } from "../../hooks/queries";

/**
 * Which dataset and model the workspace is currently about, derived from the URL:
 * - /datasets/:datasetId/...  -> that dataset; model = its most recent ready model
 * - /models/:modelId/...      -> that model; dataset = the model's dataset
 */
export function useWorkspaceContext() {
  const params = useParams();
  const modelQuery = useModel(params.modelId);
  const datasetId = params.datasetId ?? modelQuery.data?.dataset_id;
  const models = useModelList(datasetId, Boolean(datasetId));
  const readyModels = (models.data ?? []).filter((m) => m.status === "ready");
  const modelId = params.modelId ?? readyModels[0]?.id;
  const contextLoading = Boolean(params.modelId) && modelQuery.isLoading;
  return { datasetId, modelId, readyModels, modelsLoading: models.isLoading, contextLoading };
}
