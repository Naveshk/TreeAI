/** Test-only API responses, typed against api/types.ts so they track the real contract. */
import type {
  DatasetDetail,
  DatasetPreview,
  DatasetProfile,
  EvaluationResponse,
  ExplainResponse,
  InputSchema,
  ModelDetail,
  ModelSummary,
  SampleInfo,
  TreeListResponse,
  TreeStructure,
} from "../api/types";

export const DS_ID = "11111111-1111-4111-8111-111111111111";
export const MODEL_ID = "22222222-2222-4222-8222-222222222222";
export const REG_MODEL_ID = "33333333-3333-4333-8333-333333333333";

export const dataset: DatasetDetail = {
  id: DS_ID,
  name: "flowers",
  original_filename: "flowers.csv",
  source: "upload",
  file_size_bytes: 2048,
  n_rows: 60,
  n_cols: 3,
  duplicate_rows: 2,
  total_missing: 5,
  created_at: "2026-11-15T10:00:00+00:00",
  detected_encoding: "utf-8-sig",
  detected_delimiter: ";",
  columns: [
    { position: 0, name: "petal_length", dtype: "float64", inferred_kind: "numeric", missing_count: 5, unique_count: 40 },
    { position: 1, name: "color", dtype: "str", inferred_kind: "categorical", missing_count: 0, unique_count: 3 },
    { position: 2, name: "species", dtype: "str", inferred_kind: "categorical", missing_count: 0, unique_count: 3 },
  ],
  warnings: [{ code: "DUPLICATE_ROWS", column: null, message: "The dataset contains 2 duplicate row(s)." }],
};

const target = (classification: boolean, regression: boolean, suggested: "classification" | "regression" | null, reason: string | null = null) => ({
  classification,
  regression,
  suggested_task: suggested,
  missing_target_rows: 0,
  reason,
});

export const profile: DatasetProfile = {
  dataset_id: DS_ID,
  n_rows: 60,
  n_cols: 3,
  duplicate_rows: 2,
  total_missing: 5,
  missing_pct: 2.7778,
  columns: [
    {
      ...dataset.columns[0]!,
      missing_pct: 8.3333,
      sample_values: [1.4, 4.7],
      numeric_stats: { mean: 3.76, std: 1.76, min: 1, q1: 1.6, median: 4.35, q3: 5.1, max: 6.9 },
      top_values: null,
      datetime_range: null,
      target: { ...target(true, true, "regression"), missing_target_rows: 5 },
    },
    {
      ...dataset.columns[1]!,
      missing_pct: 0,
      sample_values: ["red", "blue"],
      numeric_stats: null,
      top_values: [
        { value: "red", count: 30 },
        { value: "blue", count: 20 },
      ],
      datetime_range: null,
      target: target(true, false, "classification"),
    },
    {
      ...dataset.columns[2]!,
      missing_pct: 0,
      sample_values: ["setosa"],
      numeric_stats: null,
      top_values: [{ value: "setosa", count: 20 }],
      datetime_range: null,
      target: target(true, false, "classification"),
    },
  ],
  warnings: dataset.warnings,
};

export const preview = (offset: number, limit: number): DatasetPreview => ({
  dataset_id: DS_ID,
  columns: ["petal_length", "color", "species"],
  rows: Array.from({ length: Math.max(0, Math.min(limit, 60 - offset)) }, (_, i) => [
    i + offset === 1 ? null : String(1 + (i + offset) / 10),
    "red",
    `row-${i + offset}`,
  ]),
  offset,
  limit,
  total_rows: 60,
});

export const samples: SampleInfo[] = [
  { id: "iris", name: "Iris", description: "Iris flowers.", task_type: "classification", target_column: "species" },
  { id: "wine", name: "Wine", description: "Wines.", task_type: "classification", target_column: "wine_class" },
  { id: "diabetes", name: "Diabetes", description: "Patients.", task_type: "regression", target_column: "disease_progression" },
];

export const modelDetail: ModelDetail = {
  id: MODEL_ID,
  dataset_id: DS_ID,
  name: "flowers · Random Forest",
  task_type: "classification",
  target_column: "species",
  feature_columns: ["petal_length", "color"],
  status: "ready",
  error_message: null,
  n_train: 48,
  n_test: 12,
  train_duration_ms: 420,
  created_at: "2026-11-15T10:05:00+00:00",
  column_types: { petal_length: "numeric", color: "categorical" },
  hyperparameters: { n_estimators: 3, max_depth: 10, min_samples_split: 2, min_samples_leaf: 1, max_features: "sqrt", bootstrap: true, criterion: "gini" },
  test_size: 0.2,
  random_state: 42,
  stratified: true,
  classes: ["setosa", "versicolor", "virginica"],
  rows_dropped_missing_target: 0,
  sklearn_version: "1.9.1",
};

export const modelSummary: ModelSummary = {
  id: MODEL_ID,
  dataset_id: DS_ID,
  name: modelDetail.name,
  task_type: "classification",
  target_column: "species",
  feature_columns: modelDetail.feature_columns,
  status: "ready",
  error_message: null,
  n_train: 48,
  n_test: 12,
  train_duration_ms: 420,
  created_at: modelDetail.created_at,
};

export const evaluation: EvaluationResponse = {
  model_id: MODEL_ID,
  split: "test",
  metrics: {
    task_type: "classification",
    n_samples: 12,
    accuracy: 0.8333,
    precision_macro: 0.85,
    recall_macro: 0.8333,
    f1_macro: 0.83,
    precision_weighted: 0.86,
    recall_weighted: 0.8333,
    f1_weighted: 0.835,
    per_class: [
      { label: "setosa", precision: 1, recall: 1, f1: 1, support: 4 },
      { label: "versicolor", precision: 0.75, recall: 0.75, f1: 0.75, support: 4 },
      { label: "virginica", precision: 0.8, recall: 0.75, f1: 0.77, support: 4 },
    ],
    confusion_matrix: { labels: ["setosa", "versicolor", "virginica"], matrix: [[4, 0, 0], [0, 3, 1], [0, 1, 3]] },
  },
};

export const inputSchema: InputSchema = {
  model_id: MODEL_ID,
  task_type: "classification",
  target_column: "species",
  classes: modelDetail.classes,
  features: [
    { name: "petal_length", kind: "numeric", categories: null, train_min: 1, train_max: 6.9, train_median: 4.35, train_mode: null },
    { name: "color", kind: "categorical", categories: ["blue", "red"], train_min: null, train_max: null, train_median: null, train_mode: "red" },
  ],
};

export const treeList: TreeListResponse = {
  model_id: MODEL_ID,
  task_type: "classification",
  n_trees: 3,
  trees: [0, 1, 2].map((index) => ({ index, n_nodes: 5, depth: 2, n_leaves: 3 })),
};

const node = (over: Partial<TreeStructure["nodes"][number]> & { id: number; depth: number }) => ({
  is_leaf: true,
  left: null,
  right: null,
  feature: null,
  feature_kind: null,
  threshold: null,
  threshold_display: null,
  left_rule: null,
  right_rule: null,
  n_samples: 10,
  weighted_n_samples: 14,
  impurity: 0,
  value: [1, 0, 0],
  prediction: "setosa",
  ...over,
});

export const tree0: TreeStructure = {
  model_id: MODEL_ID,
  task_type: "classification",
  criterion: "gini",
  classes: modelDetail.classes,
  tree_index: 0,
  n_nodes: 5,
  depth: 2,
  n_leaves: 3,
  nodes: [
    node({ id: 0, depth: 0, is_leaf: false, left: 1, right: 2, feature: "petal_length", feature_kind: "numeric", threshold: 2.45, threshold_display: "2.45", left_rule: "petal_length ≤ 2.45", right_rule: "petal_length > 2.45", n_samples: 38, impurity: 0.66, value: [0.33, 0.34, 0.33], prediction: "versicolor" }),
    node({ id: 1, depth: 1, n_samples: 12, value: [1, 0, 0], prediction: "setosa" }),
    node({ id: 2, depth: 1, is_leaf: false, left: 3, right: 4, feature: "color", feature_kind: "categorical", threshold: 0.5, threshold_display: "0.5", left_rule: "color ∈ {blue}", right_rule: "color ∈ {red}", n_samples: 26, impurity: 0.5, value: [0, 0.5, 0.5], prediction: "versicolor" }),
    node({ id: 3, depth: 2, n_samples: 13, value: [0, 0.9, 0.1], prediction: "versicolor" }),
    node({ id: 4, depth: 2, n_samples: 13, value: [0, 0.2, 0.8], prediction: "virginica" }),
  ],
};

export const explainResult: ExplainResponse = {
  model_id: MODEL_ID,
  task_type: "classification",
  prediction: "virginica",
  probabilities: [
    { label: "setosa", probability: 0 },
    { label: "versicolor", probability: 0.4333 },
    { label: "virginica", probability: 0.5667 },
  ],
  aggregation: "mean_of_tree_probabilities",
  vote_tally: [
    { label: "setosa", count: 0 },
    { label: "versicolor", count: 2 },
    { label: "virginica", count: 1 },
  ],
  majority_vote: ["versicolor"],
  majority_agrees_with_model: false,
  tree_mean: null,
  consistent: true,
  imputed_features: [],
  warnings: [],
  trees: [
    {
      tree_index: 0,
      prediction: "virginica",
      probabilities: [
        { label: "setosa", probability: 0 },
        { label: "versicolor", probability: 0.2 },
        { label: "virginica", probability: 0.8 },
      ],
      leaf_id: 4,
      path: [0, 2, 4],
      steps: [
        { node_id: 0, feature: "petal_length", rule: "petal_length > 2.45", went: "right", input_value: "5.1" },
        { node_id: 2, feature: "color", rule: "color ∈ {red}", went: "right", input_value: "red" },
      ],
    },
    { tree_index: 1, prediction: "versicolor", probabilities: null, leaf_id: 3, path: [0, 2, 3], steps: [] },
    { tree_index: 2, prediction: "versicolor", probabilities: null, leaf_id: 3, path: [0, 2, 3], steps: [] },
  ],
};
