"""API request/response models for training, evaluation, prediction and the forest."""

from typing import Literal

from pydantic import BaseModel, Field

TaskType = Literal["classification", "regression"]
FeatureKind = Literal["numeric", "categorical"]
ModelStatus = Literal["training", "ready", "failed"]
InputValue = str | int | float | bool | None

CLASSIFICATION_CRITERIA = ("gini", "entropy", "log_loss")
REGRESSION_CRITERIA = ("squared_error", "absolute_error", "friedman_mse")


class Hyperparameters(BaseModel):
    n_estimators: int = Field(100, ge=1, le=500)
    max_depth: int | None = Field(10, ge=1, le=30)
    min_samples_split: int = Field(2, ge=2, le=1000)
    min_samples_leaf: int = Field(1, ge=1, le=1000)
    max_features: Literal["sqrt", "log2"] | float | None = Field(
        None, description="'sqrt', 'log2', a fraction in (0, 1], or null for the task default"
    )
    bootstrap: bool = True
    criterion: str | None = Field(None, description="null for the task default")


class TrainRequest(BaseModel):
    dataset_id: str
    name: str | None = Field(None, max_length=100)
    task_type: TaskType
    target_column: str
    feature_columns: list[str] = Field(min_length=1)
    column_types: dict[str, FeatureKind] = Field(default_factory=dict)
    test_size: float = Field(0.2, ge=0.05, le=0.5)
    stratify: bool = True
    random_state: int = Field(42, ge=0, le=2**31 - 1)
    hyperparameters: Hyperparameters = Field(default_factory=Hyperparameters)


class ModelSummary(BaseModel):
    id: str
    dataset_id: str
    name: str
    task_type: TaskType
    target_column: str
    feature_columns: list[str]
    status: ModelStatus
    error_message: str | None
    n_train: int | None
    n_test: int | None
    train_duration_ms: int | None
    created_at: str


class ModelDetail(ModelSummary):
    column_types: dict[str, FeatureKind]
    hyperparameters: dict[str, str | int | float | bool | None]
    test_size: float
    random_state: int
    stratified: bool
    classes: list[str] | None
    rows_dropped_missing_target: int | None
    sklearn_version: str | None


class PerClassMetrics(BaseModel):
    label: str
    precision: float
    recall: float
    f1: float
    support: int


class ConfusionMatrix(BaseModel):
    labels: list[str]
    matrix: list[list[int]]


class ClassificationEvaluation(BaseModel):
    task_type: Literal["classification"]
    n_samples: int
    accuracy: float
    precision_macro: float
    recall_macro: float
    f1_macro: float
    precision_weighted: float
    recall_weighted: float
    f1_weighted: float
    per_class: list[PerClassMetrics]
    confusion_matrix: ConfusionMatrix


class RegressionEvaluation(BaseModel):
    task_type: Literal["regression"]
    n_samples: int
    mae: float
    mse: float
    rmse: float
    r2: float | None


class EvaluationResponse(BaseModel):
    model_id: str
    split: Literal["test"] = "test"
    metrics: ClassificationEvaluation | RegressionEvaluation = Field(discriminator="task_type")


class FeatureInput(BaseModel):
    name: str
    kind: FeatureKind
    categories: list[str] | None
    train_min: float | None
    train_max: float | None
    train_median: float | None
    train_mode: str | None


class InputSchemaResponse(BaseModel):
    model_id: str
    task_type: TaskType
    target_column: str
    classes: list[str] | None
    features: list[FeatureInput]


class PredictRequest(BaseModel):
    inputs: dict[str, InputValue]


class ClassProbability(BaseModel):
    label: str
    probability: float


class ImputedFeature(BaseModel):
    feature: str
    value: str | float | None
    strategy: str


class PredictResponse(BaseModel):
    model_id: str
    task_type: TaskType
    prediction: str | float
    probabilities: list[ClassProbability] | None
    imputed_features: list[ImputedFeature]
    warnings: list[str]


class TreeSummary(BaseModel):
    index: int
    n_nodes: int
    depth: int
    n_leaves: int


class TreeListResponse(BaseModel):
    model_id: str
    task_type: TaskType
    n_trees: int
    trees: list[TreeSummary]


class TreeNode(BaseModel):
    id: int
    depth: int
    is_leaf: bool
    left: int | None
    right: int | None
    feature: str | None
    feature_kind: FeatureKind | None
    threshold: float | None
    threshold_display: str | None
    left_rule: str | None
    right_rule: str | None
    n_samples: int
    weighted_n_samples: float
    impurity: float
    value: list[float]
    prediction: str | float


class TreeStructure(BaseModel):
    model_id: str
    task_type: TaskType
    criterion: str
    classes: list[str] | None
    tree_index: int
    n_nodes: int
    depth: int
    n_leaves: int
    nodes: list[TreeNode]


class PathStep(BaseModel):
    node_id: int
    feature: str
    rule: str
    went: Literal["left", "right"]
    input_value: str | None


class TreeExplanation(BaseModel):
    tree_index: int
    prediction: str | float
    probabilities: list[ClassProbability] | None
    leaf_id: int
    path: list[int]
    steps: list[PathStep]


class VoteCount(BaseModel):
    label: str
    count: int


class ExplainResponse(BaseModel):
    model_id: str
    task_type: TaskType
    prediction: str | float
    probabilities: list[ClassProbability] | None
    aggregation: Literal["mean_of_tree_probabilities", "mean_of_tree_predictions"]
    vote_tally: list[VoteCount] | None
    majority_vote: list[str] | None
    majority_agrees_with_model: bool | None
    tree_mean: float | None
    consistent: bool
    imputed_features: list[ImputedFeature]
    warnings: list[str]
    trees: list[TreeExplanation]
