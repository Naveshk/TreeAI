"""API request/response models for datasets and samples."""

from typing import Literal

from pydantic import BaseModel

ColumnKind = Literal["constant", "id_like", "boolean", "numeric", "datetime", "categorical", "text"]
JsonScalar = str | int | float | bool | None


class ColumnSummary(BaseModel):
    position: int
    name: str
    dtype: str
    inferred_kind: ColumnKind
    missing_count: int
    unique_count: int


class DatasetWarning(BaseModel):
    code: str
    column: str | None
    message: str


class DatasetSummary(BaseModel):
    id: str
    name: str
    original_filename: str
    source: Literal["upload", "sample"]
    file_size_bytes: int
    n_rows: int
    n_cols: int
    duplicate_rows: int
    total_missing: int
    created_at: str


class DatasetDetail(DatasetSummary):
    detected_encoding: str
    detected_delimiter: str
    columns: list[ColumnSummary]
    warnings: list[DatasetWarning]


class DatasetPreview(BaseModel):
    dataset_id: str
    columns: list[str]
    rows: list[list[str | None]]
    offset: int
    limit: int
    total_rows: int


class NumericStats(BaseModel):
    mean: float | None
    std: float | None
    min: float | None
    q1: float | None
    median: float | None
    q3: float | None
    max: float | None


class TopValue(BaseModel):
    value: JsonScalar
    count: int


class DatetimeRange(BaseModel):
    min: str | None
    max: str | None


class TargetSuitability(BaseModel):
    classification: bool
    regression: bool
    suggested_task: Literal["classification", "regression"] | None
    missing_target_rows: int
    reason: str | None


class ColumnProfile(ColumnSummary):
    missing_pct: float
    sample_values: list[JsonScalar]
    numeric_stats: NumericStats | None
    top_values: list[TopValue] | None
    datetime_range: DatetimeRange | None
    target: TargetSuitability


class DatasetProfile(BaseModel):
    dataset_id: str
    n_rows: int
    n_cols: int
    duplicate_rows: int
    total_missing: int
    missing_pct: float
    columns: list[ColumnProfile]
    warnings: list[DatasetWarning]


class SampleInfo(BaseModel):
    id: str
    name: str
    description: str
    task_type: Literal["classification", "regression"]
    target_column: str
