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
