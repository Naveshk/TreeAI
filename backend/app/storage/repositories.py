"""SQL access for table rows. Parameterized queries only.

Repositories receive an open connection and never open or close it themselves.
"""

import json
import sqlite3
from collections.abc import Sequence
from dataclasses import astuple, fields
from typing import Any

from app.storage.records import ColumnRecord, DatasetRecord, ModelRecord

_DATASET_FIELDS = [f.name for f in fields(DatasetRecord)]
_COLUMN_FIELDS = [f.name for f in fields(ColumnRecord)]


class DatasetRepository:
    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn

    def create(self, dataset: DatasetRecord, columns: Sequence[ColumnRecord]) -> None:
        """Insert a dataset and its columns atomically (all or nothing)."""
        dataset_sql = (
            f"INSERT INTO datasets ({', '.join(_DATASET_FIELDS)}) "
            f"VALUES ({', '.join('?' for _ in _DATASET_FIELDS)})"
        )
        column_sql = (
            f"INSERT INTO dataset_columns (dataset_id, {', '.join(_COLUMN_FIELDS)}) "
            f"VALUES (?, {', '.join('?' for _ in _COLUMN_FIELDS)})"
        )
        with self._conn:  # commits on success, rolls back on any exception
            self._conn.execute(dataset_sql, astuple(dataset))
            self._conn.executemany(
                column_sql, [(dataset.id, *astuple(column)) for column in columns]
            )

    def get(self, dataset_id: str) -> DatasetRecord | None:
        row = self._conn.execute(
            f"SELECT {', '.join(_DATASET_FIELDS)} FROM datasets WHERE id = ?", (dataset_id,)
        ).fetchone()
        return DatasetRecord(**dict(row)) if row else None

    def list_all(self) -> list[DatasetRecord]:
        rows = self._conn.execute(
            f"SELECT {', '.join(_DATASET_FIELDS)} FROM datasets ORDER BY created_at DESC, id"
        ).fetchall()
        return [DatasetRecord(**dict(row)) for row in rows]

    def get_columns(self, dataset_id: str) -> list[ColumnRecord]:
        rows = self._conn.execute(
            f"SELECT {', '.join(_COLUMN_FIELDS)} FROM dataset_columns "
            "WHERE dataset_id = ? ORDER BY position",
            (dataset_id,),
        ).fetchall()
        return [ColumnRecord(**dict(row)) for row in rows]

    def get_model_ids(self, dataset_id: str) -> list[str]:
        """IDs of models trained on this dataset (needed to delete their files)."""
        rows = self._conn.execute(
            "SELECT id FROM models WHERE dataset_id = ?", (dataset_id,)
        ).fetchall()
        return [row["id"] for row in rows]

    def delete(self, dataset_id: str) -> bool:
        """Delete the dataset row; columns, models and evaluations cascade."""
        with self._conn:
            cursor = self._conn.execute("DELETE FROM datasets WHERE id = ?", (dataset_id,))
        return cursor.rowcount > 0


# ---- models & evaluations -------------------------------------------------------------
# Python field -> (DB column, is_json)
_MODEL_COLUMNS: dict[str, tuple[str, bool]] = {
    "id": ("id", False),
    "dataset_id": ("dataset_id", False),
    "name": ("name", False),
    "task_type": ("task_type", False),
    "target_column": ("target_column", False),
    "feature_columns": ("feature_columns_json", True),
    "column_types": ("column_types_json", True),
    "hyperparameters": ("hyperparameters_json", True),
    "test_size": ("test_size", False),
    "random_state": ("random_state", False),
    "stratified": ("stratified", False),
    "status": ("status", False),
    "created_at": ("created_at", False),
    "error_message": ("error_message", False),
    "classes": ("classes_json", True),
    "input_schema": ("input_schema_json", True),
    "n_train": ("n_train", False),
    "n_test": ("n_test", False),
    "rows_dropped_missing_target": ("rows_dropped_missing_target", False),
    "artifact_path": ("artifact_path", False),
    "artifact_sha256": ("artifact_sha256", False),
    "sklearn_version": ("sklearn_version", False),
    "train_duration_ms": ("train_duration_ms", False),
}
_MODEL_SELECT = ", ".join(column for column, _ in _MODEL_COLUMNS.values())


def _to_db(field: str, value: Any) -> Any:
    _, is_json = _MODEL_COLUMNS[field]
    if is_json:
        return None if value is None else json.dumps(value, allow_nan=False)
    if field == "stratified":
        return int(bool(value))
    return value


def _model_from_row(row: sqlite3.Row) -> ModelRecord:
    values: dict[str, Any] = {}
    for field, (column, is_json) in _MODEL_COLUMNS.items():
        raw = row[column]
        values[field] = json.loads(raw) if (is_json and raw is not None) else raw
    values["stratified"] = bool(values["stratified"])
    return ModelRecord(**values)


class ModelRepository:
    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn

    def create(self, model: ModelRecord) -> None:
        columns = [column for column, _ in _MODEL_COLUMNS.values()]
        values = [_to_db(field, getattr(model, field)) for field in _MODEL_COLUMNS]
        sql = (
            f"INSERT INTO models ({', '.join(columns)}) VALUES ({', '.join('?' for _ in columns)})"
        )
        with self._conn:
            self._conn.execute(sql, values)

    def get(self, model_id: str) -> ModelRecord | None:
        row = self._conn.execute(
            f"SELECT {_MODEL_SELECT} FROM models WHERE id = ?", (model_id,)
        ).fetchone()
        return _model_from_row(row) if row else None

    def list_all(self, dataset_id: str | None = None) -> list[ModelRecord]:
        sql = f"SELECT {_MODEL_SELECT} FROM models"
        params: tuple[Any, ...] = ()
        if dataset_id is not None:
            sql += " WHERE dataset_id = ?"
            params = (dataset_id,)
        rows = self._conn.execute(sql + " ORDER BY created_at DESC, id", params).fetchall()
        return [_model_from_row(row) for row in rows]

    def mark_ready(
        self, model_id: str, fields_: dict[str, Any], metrics: dict[str, Any], created_at: str
    ) -> None:
        """Store training results and the evaluation atomically."""
        assignments = ", ".join(f"{_MODEL_COLUMNS[f][0]} = ?" for f in fields_)
        values = [_to_db(f, v) for f, v in fields_.items()]
        with self._conn:
            self._conn.execute(
                f"UPDATE models SET status = 'ready', error_message = NULL, {assignments} "
                "WHERE id = ?",
                (*values, model_id),
            )
            self._conn.execute(
                "INSERT INTO evaluations (model_id, split, n_samples, metrics_json, created_at) "
                "VALUES (?, 'test', ?, ?, ?)",
                (model_id, metrics["n_samples"], json.dumps(metrics, allow_nan=False), created_at),
            )

    def mark_failed(self, model_id: str, message: str) -> None:
        with self._conn:
            self._conn.execute(
                "UPDATE models SET status = 'failed', error_message = ? WHERE id = ?",
                (message, model_id),
            )

    def get_evaluation(self, model_id: str) -> dict[str, Any] | None:
        row = self._conn.execute(
            "SELECT metrics_json FROM evaluations WHERE model_id = ?", (model_id,)
        ).fetchone()
        return json.loads(row["metrics_json"]) if row else None

    def delete(self, model_id: str) -> bool:
        with self._conn:
            cursor = self._conn.execute("DELETE FROM models WHERE id = ?", (model_id,))
        return cursor.rowcount > 0
