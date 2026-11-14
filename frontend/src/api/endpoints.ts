import { requestJson } from "./client";
import type {
  DatasetDetail,
  DatasetPreview,
  DatasetProfile,
  DatasetSummary,
  EvaluationResponse,
  ExplainResponse,
  InputSchema,
  ModelDetail,
  ModelSummary,
  PredictionInputs,
  PredictResponse,
  SampleInfo,
  TrainRequest,
  TreeListResponse,
  TreeStructure,
} from "./types";

const enc = encodeURIComponent;

// ---- datasets & samples -----------------------------------------------------------------
export const listDatasets = () => requestJson<DatasetSummary[]>("/datasets");
export const getDataset = (id: string) => requestJson<DatasetDetail>(`/datasets/${enc(id)}`);
export const getProfile = (id: string) =>
  requestJson<DatasetProfile>(`/datasets/${enc(id)}/profile`);
export const getPreview = (id: string, offset: number, limit: number) =>
  requestJson<DatasetPreview>(`/datasets/${enc(id)}/preview?offset=${offset}&limit=${limit}`);
export const deleteDataset = (id: string) =>
  requestJson<void>(`/datasets/${enc(id)}`, { method: "DELETE" });

export const listSamples = () => requestJson<SampleInfo[]>("/samples");
export const loadSample = (id: string) =>
  requestJson<DatasetDetail>(`/samples/${enc(id)}/load`, { method: "POST" });

// ---- models -----------------------------------------------------------------------------
export const listModels = (datasetId?: string) =>
  requestJson<ModelSummary[]>(datasetId ? `/models?dataset_id=${enc(datasetId)}` : "/models");
export const getModel = (id: string) => requestJson<ModelDetail>(`/models/${enc(id)}`);
export const trainModel = (body: TrainRequest) =>
  requestJson<ModelDetail>("/models", { method: "POST", body: JSON.stringify(body) });
export const deleteModel = (id: string) =>
  requestJson<void>(`/models/${enc(id)}`, { method: "DELETE" });
export const getEvaluation = (id: string) =>
  requestJson<EvaluationResponse>(`/models/${enc(id)}/evaluation`);
export const getInputSchema = (id: string) =>
  requestJson<InputSchema>(`/models/${enc(id)}/input-schema`);
export const predict = (id: string, inputs: PredictionInputs) =>
  requestJson<PredictResponse>(`/models/${enc(id)}/predict`, {
    method: "POST",
    body: JSON.stringify({ inputs }),
  });
export const listTrees = (id: string) => requestJson<TreeListResponse>(`/models/${enc(id)}/trees`);
export const getTree = (id: string, index: number) =>
  requestJson<TreeStructure>(`/models/${enc(id)}/trees/${index}`);
export const explain = (id: string, inputs: PredictionInputs) =>
  requestJson<ExplainResponse>(`/models/${enc(id)}/explain`, {
    method: "POST",
    body: JSON.stringify({ inputs }),
  });
