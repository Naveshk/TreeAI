"""Typed records returned by the repositories (one per database row)."""

from dataclasses import dataclass


@dataclass(frozen=True)
class DatasetRecord:
    id: str
    name: str
    original_filename: str
    source: str  # 'upload' | 'sample'
    file_path: str  # relative to the data directory
    file_size_bytes: int
    sha256: str
    n_rows: int
    n_cols: int
    duplicate_rows: int
    total_missing: int
    detected_encoding: str
    detected_delimiter: str
    created_at: str  # ISO-8601 UTC


@dataclass(frozen=True)
class ColumnRecord:
    position: int
    name: str
    dtype: str
    inferred_kind: str
    missing_count: int
    unique_count: int


@dataclass(frozen=True)
class ModelRecord:
    id: str
    dataset_id: str
    name: str
    task_type: str  # 'classification' | 'regression'
    target_column: str
    feature_columns: list[str]
    column_types: dict[str, str]
    hyperparameters: dict
    test_size: float
    random_state: int
    stratified: bool
    status: str  # 'training' | 'ready' | 'failed'
    created_at: str
    error_message: str | None = None
    classes: list[str] | None = None
    input_schema: list[dict] | None = None
    n_train: int | None = None
    n_test: int | None = None
    rows_dropped_missing_target: int | None = None
    artifact_path: str | None = None
    artifact_sha256: str | None = None
    sklearn_version: str | None = None
    train_duration_ms: int | None = None
