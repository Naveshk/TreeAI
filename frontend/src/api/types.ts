/** TypeScript mirror of the backend Pydantic schemas (backend/app/schemas). */

export type ColumnKind =
  | "constant"
  | "id_like"
  | "boolean"
  | "numeric"
  | "datetime"
  | "categorical"
  | "text";
export type JsonScalar = string | number | boolean | null;
export type TaskType = "classification" | "regression";
export type FeatureKind = "numeric" | "categorical";

export interface ColumnSummary {
  position: number;
  name: string;
  dtype: string;
  inferred_kind: ColumnKind;
  missing_count: number;
  unique_count: number;
}

export interface DatasetWarning {
  code: string;
  column: string | null;
  message: string;
}

export interface DatasetSummary {
  id: string;
  name: string;
  original_filename: string;
  source: "upload" | "sample";
  file_size_bytes: number;
  n_rows: number;
  n_cols: number;
  duplicate_rows: number;
  total_missing: number;
  created_at: string;
}

export interface DatasetDetail extends DatasetSummary {
  detected_encoding: string;
  detected_delimiter: string;
  columns: ColumnSummary[];
  warnings: DatasetWarning[];
}

export interface DatasetPreview {
  dataset_id: string;
  columns: string[];
  rows: (string | null)[][];
  offset: number;
  limit: number;
  total_rows: number;
}

export interface NumericStats {
  mean: number | null;
  std: number | null;
  min: number | null;
  q1: number | null;
  median: number | null;
  q3: number | null;
  max: number | null;
}

export interface TopValue {
  value: JsonScalar;
  count: number;
}

export interface TargetSuitability {
  classification: boolean;
  regression: boolean;
  suggested_task: TaskType | null;
  missing_target_rows: number;
  reason: string | null;
}

export interface ColumnProfile extends ColumnSummary {
  missing_pct: number;
  sample_values: JsonScalar[];
  numeric_stats: NumericStats | null;
  top_values: TopValue[] | null;
  datetime_range: { min: string | null; max: string | null } | null;
  target: TargetSuitability;
}

export interface DatasetProfile {
  dataset_id: string;
  n_rows: number;
  n_cols: number;
  duplicate_rows: number;
  total_missing: number;
  missing_pct: number;
  columns: ColumnProfile[];
  warnings: DatasetWarning[];
}

export interface SampleInfo {
  id: string;
  name: string;
  description: string;
  task_type: TaskType;
  target_column: string;
}

// ---- models ---------------------------------------------------------------------------

export interface Hyperparameters {
  n_estimators: number;
  max_depth: number | null;
  min_samples_split: number;
  min_samples_leaf: number;
  max_features: "sqrt" | "log2" | number | null;
  bootstrap: boolean;
  criterion: string | null;
}

export interface TrainRequest {
  dataset_id: string;
  name?: string | null;
  task_type: TaskType;
  target_column: string;
  feature_columns: string[];
  column_types: Record<string, FeatureKind>;
  test_size: number;
  stratify: boolean;
  random_state: number;
  hyperparameters: Hyperparameters;
}

export type ModelStatus = "training" | "ready" | "failed";

export interface ModelSummary {
  id: string;
  dataset_id: string;
  name: string;
  task_type: TaskType;
  target_column: string;
  feature_columns: string[];
  status: ModelStatus;
  error_message: string | null;
  n_train: number | null;
  n_test: number | null;
  train_duration_ms: number | null;
  created_at: string;
}

export interface ModelDetail extends ModelSummary {
  column_types: Record<string, FeatureKind>;
  hyperparameters: Record<string, string | number | boolean | null>;
  test_size: number;
  random_state: number;
  stratified: boolean;
  classes: string[] | null;
  rows_dropped_missing_target: number | null;
  sklearn_version: string | null;
}

export interface PerClassMetrics {
  label: string;
  precision: number;
  recall: number;
  f1: number;
  support: number;
}

export interface ClassificationMetrics {
  task_type: "classification";
  n_samples: number;
  accuracy: number;
  precision_macro: number;
  recall_macro: number;
  f1_macro: number;
  precision_weighted: number;
  recall_weighted: number;
  f1_weighted: number;
  per_class: PerClassMetrics[];
  confusion_matrix: { labels: string[]; matrix: number[][] };
}

export interface RegressionMetrics {
  task_type: "regression";
  n_samples: number;
  mae: number;
  mse: number;
  rmse: number;
  r2: number | null;
}

export interface EvaluationResponse {
  model_id: string;
  split: "test";
  metrics: ClassificationMetrics | RegressionMetrics;
}

export interface FeatureInput {
  name: string;
  kind: FeatureKind;
  categories: string[] | null;
  train_min: number | null;
  train_max: number | null;
  train_median: number | null;
  train_mode: string | null;
}

export interface InputSchema {
  model_id: string;
  task_type: TaskType;
  target_column: string;
  classes: string[] | null;
  features: FeatureInput[];
}

export type InputValue = string | number | boolean | null;
export type PredictionInputs = Record<string, InputValue>;

export interface ClassProbability {
  label: string;
  probability: number;
}

export interface ImputedFeature {
  feature: string;
  value: string | number | null;
  strategy: string;
}

export interface PredictResponse {
  model_id: string;
  task_type: TaskType;
  prediction: string | number;
  probabilities: ClassProbability[] | null;
  imputed_features: ImputedFeature[];
  warnings: string[];
}

export interface TreeSummary {
  index: number;
  n_nodes: number;
  depth: number;
  n_leaves: number;
}

export interface TreeListResponse {
  model_id: string;
  task_type: TaskType;
  n_trees: number;
  trees: TreeSummary[];
}

export interface TreeNode {
  id: number;
  depth: number;
  is_leaf: boolean;
  left: number | null;
  right: number | null;
  feature: string | null;
  feature_kind: FeatureKind | null;
  threshold: number | null;
  threshold_display: string | null;
  left_rule: string | null;
  right_rule: string | null;
  n_samples: number;
  weighted_n_samples: number;
  impurity: number;
  value: number[];
  prediction: string | number;
}

export interface TreeStructure {
  model_id: string;
  task_type: TaskType;
  criterion: string;
  classes: string[] | null;
  tree_index: number;
  n_nodes: number;
  depth: number;
  n_leaves: number;
  nodes: TreeNode[];
}

export interface PathStep {
  node_id: number;
  feature: string;
  rule: string;
  went: "left" | "right";
  input_value: string | null;
}

export interface TreeExplanation {
  tree_index: number;
  prediction: string | number;
  probabilities: ClassProbability[] | null;
  leaf_id: number;
  path: number[];
  steps: PathStep[];
}

export interface ExplainResponse {
  model_id: string;
  task_type: TaskType;
  prediction: string | number;
  probabilities: ClassProbability[] | null;
  aggregation: "mean_of_tree_probabilities" | "mean_of_tree_predictions";
  vote_tally: { label: string; count: number }[] | null;
  majority_vote: string[] | null;
  majority_agrees_with_model: boolean | null;
  tree_mean: number | null;
  consistent: boolean;
  imputed_features: ImputedFeature[];
  warnings: string[];
  trees: TreeExplanation[];
}
