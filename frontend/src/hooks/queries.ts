/** TanStack Query hooks: all server data flows through here (never fetched in components). */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as api from "../api/endpoints";
import type { PredictionInputs, TrainRequest } from "../api/types";

export const keys = {
  datasets: ["datasets"] as const,
  dataset: (id: string) => ["dataset", id] as const,
  profile: (id: string) => ["profile", id] as const,
  preview: (id: string, offset: number, limit: number) => ["preview", id, offset, limit] as const,
  samples: ["samples"] as const,
  models: (datasetId?: string) => ["models", datasetId ?? "all"] as const,
  model: (id: string) => ["model", id] as const,
  evaluation: (id: string) => ["evaluation", id] as const,
  inputSchema: (id: string) => ["input-schema", id] as const,
  trees: (id: string) => ["trees", id] as const,
  tree: (id: string, index: number) => ["tree", id, index] as const,
};

// ---- datasets ---------------------------------------------------------------------------
export const useDatasetList = () => useQuery({ queryKey: keys.datasets, queryFn: api.listDatasets });

export const useDataset = (id: string | undefined) =>
  useQuery({
    queryKey: keys.dataset(id ?? ""),
    queryFn: () => api.getDataset(id as string),
    enabled: Boolean(id),
  });

export const useDatasetProfile = (id: string | undefined) =>
  useQuery({
    queryKey: keys.profile(id ?? ""),
    queryFn: () => api.getProfile(id as string),
    enabled: Boolean(id),
  });

export const useDatasetPreview = (id: string, offset: number, limit: number) =>
  useQuery({
    queryKey: keys.preview(id, offset, limit),
    queryFn: () => api.getPreview(id, offset, limit),
    placeholderData: keepPreviousData,
  });

export function useDeleteDataset() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.deleteDataset,
    onSuccess: (_data, id) => {
      for (const key of [keys.dataset(id), keys.profile(id), ["preview", id]]) {
        client.removeQueries({ queryKey: key });
      }
      void client.invalidateQueries({ queryKey: keys.datasets });
      void client.invalidateQueries({ queryKey: ["models"] });
    },
  });
}

export const useSamples = () => useQuery({ queryKey: keys.samples, queryFn: api.listSamples });

export function useLoadSample() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.loadSample,
    onSuccess: () => void client.invalidateQueries({ queryKey: keys.datasets }),
  });
}

// ---- models -----------------------------------------------------------------------------
export const useModelList = (datasetId?: string, enabled = true) =>
  useQuery({
    queryKey: keys.models(datasetId),
    queryFn: () => api.listModels(datasetId),
    enabled,
  });

export const useModel = (id: string | undefined) =>
  useQuery({
    queryKey: keys.model(id ?? ""),
    queryFn: () => api.getModel(id as string),
    enabled: Boolean(id),
  });

export const useEvaluation = (id: string, enabled = true) =>
  useQuery({ queryKey: keys.evaluation(id), queryFn: () => api.getEvaluation(id), enabled });

export const useInputSchema = (id: string, enabled = true) =>
  useQuery({ queryKey: keys.inputSchema(id), queryFn: () => api.getInputSchema(id), enabled });

export const useTreeList = (id: string, enabled = true) =>
  useQuery({ queryKey: keys.trees(id), queryFn: () => api.listTrees(id), enabled });

export const useTree = (id: string, index: number, enabled = true) =>
  useQuery({
    queryKey: keys.tree(id, index),
    queryFn: () => api.getTree(id, index),
    enabled,
    staleTime: Infinity, // a trained tree never changes
  });

export function useTrainModel() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: TrainRequest) => api.trainModel(body),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["models"] }),
  });
}

export function useDeleteModel() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.deleteModel,
    onSuccess: (_data, id) => {
      client.removeQueries({ queryKey: keys.model(id) });
      void client.invalidateQueries({ queryKey: ["models"] });
    },
  });
}

export const usePredict = (id: string) =>
  useMutation({ mutationFn: (inputs: PredictionInputs) => api.predict(id, inputs) });

export const useExplain = (id: string) =>
  useMutation({ mutationFn: (inputs: PredictionInputs) => api.explain(id, inputs) });
